'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loading } from '@/components/Loading';
import { useToast } from '@/components/Toast';
import { ConnectionStatus, useConnectionStatus } from '@/components/ConnectionStatus';
import { LoadingButton } from '@/components/LoadingButton';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { cleanupOldSessions } from '@/lib/sessions';
import { Quiz, AuthUser } from '@/types';
import { sanitizeQuizImport } from '@/lib/utils';
import Icon from '@mdi/react';
import {
  mdiPlus,
  mdiPencil,
  mdiDelete,
  mdiPlay,
  mdiLogout,
  mdiClipboardList,
  mdiUpload,
  mdiDownload,
  mdiCheckboxMarked,
  mdiCheckboxBlankOutline,
  mdiClose,
  mdiBroom,
} from '@mdi/js';

export default function Dashboard() {
  const { user, loading, signOut, isHost } = useAuth();
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedQuizzes, setSelectedQuizzes] = useState<Set<string>>(new Set());
  const [exportMode, setExportMode] = useState(false);
  
  const { showToast } = useToast();
  const { isOnline, retry, retryCount } = useConnectionStatus();

  useEffect(() => {
    if (!loading && !isHost) {
      router.push('/');
    }
  }, [loading, isHost, router]);

  // Cleanup old sessions on dashboard load
  useEffect(() => {
    if (!loading && isHost) {
      cleanupOldSessions().catch(console.error);
    }
  }, [loading, isHost]);

  useEffect(() => {
    if (!user || !isHost) return;

    const q = query(collection(getDb(), 'quizzes'), where('ownerUid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const quizData: Quiz[] = [];
      snapshot.forEach((doc) => {
        quizData.push({ id: doc.id, ...doc.data() } as Quiz);
      });
      setQuizzes(quizData);
      setLoadingQuizzes(false);
    });

    return () => unsubscribe();
  }, [user, isHost]);

  const handleDeleteQuiz = async (quizId: string) => {
    setIsDeleting(quizId);
    try {
      const operation = async () => {
        await deleteDoc(doc(getDb(), 'quizzes', quizId));
      };
      
      if (!isOnline) {
        const success = await retry(operation);
        if (!success) {
          showToast('Failed to delete quiz. Please check connection.', 'error');
          return;
        }
      } else {
        await operation();
      }
      
      setDeleteConfirm(null);
      showToast('Quiz deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting quiz:', error);
      showToast('Failed to delete quiz', 'error');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      showToast('Signed out successfully', 'info');
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
      showToast('Failed to sign out', 'error');
    }
  };

  const toggleQuizSelection = (quizId: string) => {
    const newSelected = new Set(selectedQuizzes);
    if (newSelected.has(quizId)) {
      newSelected.delete(quizId);
    } else {
      newSelected.add(quizId);
    }
    setSelectedQuizzes(newSelected);
  };

  const selectAllQuizzes = () => {
    if (selectedQuizzes.size === quizzes.length) {
      setSelectedQuizzes(new Set());
    } else {
      setSelectedQuizzes(new Set(quizzes.map(q => q.id!)));
    }
  };

  const exportSelectedQuizzes = async () => {
    if (selectedQuizzes.size === 0) {
      showToast('Please select at least one quiz to export', 'error');
      return;
    }
    
    setIsExporting(true);
    try {

    const quizzesToExport = quizzes.filter(q => selectedQuizzes.has(q.id!));
    
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      quizCount: quizzesToExport.length,
      quizzes: quizzesToExport.map(quiz => ({
        title: quiz.title,
        description: quiz.description || '',
        questions: quiz.questions?.map(q => ({
          question: q.question,
          options: q.options,
          correctIndices: q.correctIndices,
          timeLimit: q.timeLimit,
        })) || [],
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().split('T')[0];
    a.download = `quizzes_export_${timestamp}_${quizzesToExport.length}_quizzes.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Exit export mode after export
    setExportMode(false);
    setSelectedQuizzes(new Set());
    
      showToast(`Exported ${quizzesToExport.length} quiz${quizzesToExport.length > 1 ? 'zes' : ''}!`, 'success');
    } catch (error) {
      console.error('Error exporting quizzes:', error);
      showToast('Failed to export quizzes', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportQuiz = () => {
    fileInputRef.current?.click();
  };

  const importSingleQuiz = async (quizData: Record<string, unknown>, user: AuthUser) => {
    // Sanitize the quiz data before saving
    const { sanitized } = sanitizeQuizImport(quizData);
    
    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
    await addDoc(collection(getDb(), 'quizzes'), {
      ownerUid: user.uid,
      title: sanitized.title,
      description: sanitized.description || '',
      createdAt: serverTimestamp(),
      questions: (sanitized.questions as Array<Record<string, unknown>>).map((q: Record<string, unknown>) => ({
        question: q.question,
        options: q.options,
        correctIndices: q.correctIndices,
        timeLimit: q.timeLimit || 20,
      })),
    });
  };

  const validateQuiz = (quiz: Record<string, unknown>, index?: number): string | null => {
    const prefix = index !== undefined ? `Quiz ${index + 1}: ` : '';
    if (!quiz.title || !Array.isArray(quiz.questions)) {
      return `${prefix}Invalid quiz format`;
    }
    for (let i = 0; i < quiz.questions.length; i++) {
      const q = quiz.questions[i];
      if (!q.question || !Array.isArray(q.options) || !Array.isArray(q.correctIndices)) {
        return `${prefix}Invalid question format at question ${i + 1}`;
      }
    }
    return null;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const importedData = JSON.parse(text);

      let quizzesToImport: Record<string, unknown>[] = [];

      // Check if it's a multi-quiz export format
      if (importedData.quizzes && Array.isArray(importedData.quizzes)) {
        quizzesToImport = importedData.quizzes;
      } else if (importedData.title && Array.isArray(importedData.questions)) {
        // Single quiz format
        quizzesToImport = [importedData];
      } else {
        showToast('Invalid quiz file format', 'error');
        return;
      }

      // Validate all quizzes first
      for (let i = 0; i < quizzesToImport.length; i++) {
        const error = validateQuiz(quizzesToImport[i], quizzesToImport.length > 1 ? i : undefined);
        if (error) {
          showToast(error, 'error');
          return;
        }
      }

      // Validate and sanitize all quizzes for XSS patterns
      const allErrors: string[] = [];
      for (let i = 0; i < quizzesToImport.length; i++) {
        const { errors } = sanitizeQuizImport(quizzesToImport[i]);
        if (errors.length > 0) {
          // Prefix errors with quiz number if multiple quizzes
          if (quizzesToImport.length > 1) {
            allErrors.push(...errors.map(e => `Quiz ${i + 1}: ${e}`));
          } else {
            allErrors.push(...errors);
          }
        }
      }

      if (allErrors.length > 0) {
        showToast(`Import failed: ${allErrors.join(', ')}`, 'error');
        return;
      }

      // Import all quizzes
      for (const quiz of quizzesToImport) {
        await importSingleQuiz(quiz, user);
      }

      showToast(`Successfully imported ${quizzesToImport.length} quiz${quizzesToImport.length > 1 ? 'zes' : ''}!`, 'success');
    } catch (error) {
      console.error('Error importing quiz:', error);
      showToast('Failed to import quiz. Please check the file format.', 'error');
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCleanupSessions = async () => {
    setIsCleaning(true);
    try {
      await cleanupOldSessions();
      showToast('Old sessions cleaned up!', 'success');
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
      showToast('Failed to cleanup sessions', 'error');
    } finally {
      setIsCleaning(false);
    }
  };

  if (loading || !isHost) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading message="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ConnectionStatus retryCount={retryCount} />
      {/* Header */}
      <header className="border-b border-card-border">
        <div className="flex justify-between items-center p-4 max-w-6xl mx-auto">
          <h1
            className="text-2xl font-bold text-primary flex items-center gap-2"
          >
            <img src="/icon.svg" alt="" className="w-7 h-7" />
            Quizer
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-foreground/70 hidden sm:block">
              {user?.displayName || user?.email}
            </span>
            <ThemeToggle />
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg bg-card-bg border border-card-border hover:bg-error/10 hover:border-error transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <Icon path={mdiLogout} size={1} className="text-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-4">
        {exportMode && (
          <div className="bg-primary/10 border border-primary rounded-lg p-4 mb-6 animate-fade-in">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <span className="font-semibold">Export Mode</span>
                <span className="text-foreground/70">
                  {selectedQuizzes.size} of {quizzes.length} selected
                </span>
                <button
                  onClick={selectAllQuizzes}
                  className="text-sm text-primary hover:underline"
                >
                  {selectedQuizzes.size === quizzes.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <LoadingButton
                  onClick={exportSelectedQuizzes}
                  loading={isExporting}
                  disabled={selectedQuizzes.size === 0 || isExporting}
                  className="py-2"
                  aria-label={`Export ${selectedQuizzes.size} selected quizzes`}
                >
                  <Icon path={mdiDownload} size={0.8} aria-hidden="true" />
                  Export ({selectedQuizzes.size})
                </LoadingButton>
                <button
                  onClick={() => {
                    setExportMode(false);
                    setSelectedQuizzes(new Set());
                  }}
                  className="p-2 rounded-lg bg-card-bg border border-card-border hover:bg-error/10 hover:border-error transition-colors"
                  title="Cancel export"
                  aria-label="Cancel export mode"
                >
                  <Icon path={mdiClose} size={1} className="text-foreground" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold">My Quizzes</h2>
          <div className="flex items-center gap-2">
            {!exportMode && quizzes.length > 0 && (
              <button
                onClick={() => setExportMode(true)}
                className="btn-secondary flex items-center gap-2"
                title="Export quizzes"
                aria-label="Export selected quizzes"
              >
                <Icon path={mdiDownload} size={1} aria-hidden="true" />
                Export
              </button>
            )}
            <LoadingButton
              onClick={handleImportQuiz}
              loading={isImporting}
              variant="secondary"
              aria-label="Import quiz from JSON file"
            >
              <Icon path={mdiUpload} size={1} aria-hidden="true" />
              Import
            </LoadingButton>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => router.push('/quiz/new')}
              className="btn-primary flex items-center gap-2"
              aria-label="Create new quiz"
            >
              <Icon path={mdiPlus} size={1} aria-hidden="true" />
              Create Quiz
            </button>
          </div>
          <LoadingButton
            onClick={handleCleanupSessions}
            loading={isCleaning}
            variant="secondary"
            className="text-sm py-2 px-3 mt-2"
            aria-label="Cleanup old sessions"
          >
            <Icon path={mdiBroom} size={0.8} aria-hidden="true" />
            Cleanup Old Sessions
          </LoadingButton>
          </div>

        {loadingQuizzes ? (
          <Loading message="Loading quizzes..." />
        ) : quizzes.length === 0 ? (
          <div className="card text-center py-12 animate-fade-in">
            <Icon
              path={mdiClipboardList}
              size={3}
              className="text-foreground/30 mx-auto mb-4"
            />
            <h3 className="text-xl font-semibold mb-2">No quizzes yet</h3>
            <p className="text-foreground/70 mb-6">
              Create your first quiz to get started!
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={handleImportQuiz}
                className="btn-secondary inline-flex items-center gap-2"
                aria-label="Import quiz from JSON file"
              >
                <Icon path={mdiUpload} size={1} aria-hidden="true" />
                Import Quiz
              </button>
              <button
                onClick={() => router.push('/quiz/new')}
                className="btn-primary inline-flex items-center gap-2"
                aria-label="Create new quiz"
              >
                <Icon path={mdiPlus} size={1} aria-hidden="true" />
                Create Quiz
              </button>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {quizzes.map((quiz, index) => (
              <div
                key={quiz.id}
                className={`card animate-slide-in hover:border-primary/50 ${
                  exportMode && selectedQuizzes.has(quiz.id!)
                    ? 'border-primary bg-primary/5'
                    : ''
                }`}
                style={{ animationDelay: `${index * 0.05}s` }}
                onClick={exportMode ? () => toggleQuizSelection(quiz.id!) : undefined}
                role={exportMode ? 'button' : undefined}
                tabIndex={exportMode ? 0 : undefined}
                aria-label={exportMode ? `Select ${quiz.title} for export` : undefined}
                aria-pressed={exportMode ? selectedQuizzes.has(quiz.id!) : undefined}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-xl font-bold truncate flex-1">{quiz.title}</h3>
                  {exportMode && (
                    <div className="ml-2">
                      <Icon
                        path={selectedQuizzes.has(quiz.id!) ? mdiCheckboxMarked : mdiCheckboxBlankOutline}
                        size={1}
                        className={selectedQuizzes.has(quiz.id!) ? 'text-primary' : 'text-foreground/30'}
                      />
                    </div>
                  )}
                </div>
                <p className="text-foreground/70 text-sm mb-4 line-clamp-2">
                  {quiz.description || 'No description'}
                </p>
                <div className="flex items-center text-sm text-foreground/50 mb-4">
                  <span>{quiz.questions?.length || 0} questions</span>
                </div>
                {!exportMode && (
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/session/new?quiz=${quiz.id}`);
                      }}
                      className="btn-primary flex-1 flex items-center justify-center gap-1 py-2"
                      title="Start game"
                      aria-label={`Start game: ${quiz.title}`}
                    >
                      <Icon path={mdiPlay} size={0.8} aria-hidden="true" />
                      Play
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/quiz/${quiz.id}`);
                      }}
                      className="p-2 rounded-lg bg-card-bg border border-card-border hover:bg-primary/10 hover:border-primary transition-colors"
                      title="Edit quiz"
                      aria-label={`Edit quiz: ${quiz.title}`}
                    >
                      <Icon path={mdiPencil} size={0.8} aria-hidden="true" />
                    </button>
                    {deleteConfirm === quiz.id ? (
                      <LoadingButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteQuiz(quiz.id!);
                        }}
                        loading={isDeleting === quiz.id}
                        disabled={isDeleting === quiz.id}
                        variant="secondary"
                        className="p-2 rounded-lg bg-error text-white hover:bg-error/80 border-0"
                        title="Confirm delete"
                        aria-label={`Confirm delete quiz: ${quiz.title}`}
                      >
                        <Icon path={mdiDelete} size={0.8} aria-hidden="true" />
                      </LoadingButton>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm(quiz.id!);
                        }}
                        className="p-2 rounded-lg bg-card-bg border border-card-border hover:bg-error/10 hover:border-error transition-colors"
                        title="Delete quiz"
                        aria-label={`Delete quiz: ${quiz.title}`}
                      >
                        <Icon path={mdiDelete} size={0.8} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
