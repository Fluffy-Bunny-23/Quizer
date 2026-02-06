'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loading } from '@/components/Loading';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { Quiz } from '@/types';
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
} from '@mdi/js';

export default function Dashboard() {
  const { user, loading, signOut, isHost } = useAuth();
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedQuizzes, setSelectedQuizzes] = useState<Set<string>>(new Set());
  const [exportMode, setExportMode] = useState(false);

  useEffect(() => {
    if (!loading && !isHost) {
      router.push('/');
    }
  }, [loading, isHost, router]);

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
    try {
      await deleteDoc(doc(getDb(), 'quizzes', quizId));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting quiz:', error);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
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

  const exportSelectedQuizzes = () => {
    if (selectedQuizzes.size === 0) {
      alert('Please select at least one quiz to export');
      return;
    }

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
  };

  const handleImportQuiz = () => {
    fileInputRef.current?.click();
  };

  const importSingleQuiz = async (quizData: any, user: any) => {
    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
    await addDoc(collection(getDb(), 'quizzes'), {
      ownerUid: user.uid,
      title: quizData.title,
      description: quizData.description || '',
      createdAt: serverTimestamp(),
      questions: quizData.questions.map((q: any) => ({
        question: q.question.trim(),
        options: q.options.map((o: string) => o.trim()),
        correctIndices: q.correctIndices,
        timeLimit: q.timeLimit || 20,
      })),
    });
  };

  const validateQuiz = (quiz: any, index?: number): string | null => {
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

    try {
      const text = await file.text();
      const importedData = JSON.parse(text);

      let quizzesToImport: any[] = [];

      // Check if it's a multi-quiz export format
      if (importedData.quizzes && Array.isArray(importedData.quizzes)) {
        quizzesToImport = importedData.quizzes;
      } else if (importedData.title && Array.isArray(importedData.questions)) {
        // Single quiz format
        quizzesToImport = [importedData];
      } else {
        alert('Invalid quiz file format');
        return;
      }

      // Validate all quizzes first
      for (let i = 0; i < quizzesToImport.length; i++) {
        const error = validateQuiz(quizzesToImport[i], quizzesToImport.length > 1 ? i : undefined);
        if (error) {
          alert(error);
          return;
        }
      }

      // Import all quizzes
      for (const quiz of quizzesToImport) {
        await importSingleQuiz(quiz, user);
      }

      alert(`Successfully imported ${quizzesToImport.length} quiz${quizzesToImport.length > 1 ? 'zes' : ''}!`);
    } catch (error) {
      console.error('Error importing quiz:', error);
      alert('Failed to import quiz. Please check the file format.');
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
      {/* Header */}
      <header className="border-b border-card-border">
        <div className="flex justify-between items-center p-4 max-w-6xl mx-auto">
          <h1
            className="text-2xl font-bold text-primary cursor-pointer"
            onClick={() => router.push('/')}
          >
            ⚡ Quizer
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
                <button
                  onClick={exportSelectedQuizzes}
                  disabled={selectedQuizzes.size === 0}
                  className="btn-primary flex items-center gap-2 py-2 disabled:opacity-50"
                  aria-disabled={selectedQuizzes.size === 0}
                  aria-label={`Export ${selectedQuizzes.size} selected quizzes`}
                >
                  <Icon path={mdiDownload} size={0.8} aria-hidden="true" />
                  Export ({selectedQuizzes.size})
                </button>
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
            <button
              onClick={handleImportQuiz}
              className="btn-secondary flex items-center gap-2"
              title="Import quiz from JSON"
              aria-label="Import quiz from JSON file"
            >
              <Icon path={mdiUpload} size={1} aria-hidden="true" />
              Import
            </button>
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteQuiz(quiz.id!);
                        }}
                        className="p-2 rounded-lg bg-error text-white hover:bg-error/80 transition-colors"
                        title="Confirm delete"
                        aria-label={`Confirm delete quiz: ${quiz.title}`}
                      >
                        <Icon path={mdiDelete} size={0.8} aria-hidden="true" />
                      </button>
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
