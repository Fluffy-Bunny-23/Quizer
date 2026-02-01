'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loading } from '@/components/Loading';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
} from '@mdi/js';

export default function Dashboard() {
  const { user, loading, signOut, isHost } = useAuth();
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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
            >
              <Icon path={mdiLogout} size={1} className="text-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-4">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold">My Quizzes</h2>
          <button
            onClick={() => router.push('/quiz/new')}
            className="btn-primary flex items-center gap-2"
          >
            <Icon path={mdiPlus} size={1} />
            Create Quiz
          </button>
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
            <button
              onClick={() => router.push('/quiz/new')}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Icon path={mdiPlus} size={1} />
              Create Quiz
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quizzes.map((quiz, index) => (
              <div
                key={quiz.id}
                className="card animate-slide-in hover:border-primary/50"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <h3 className="text-xl font-bold mb-2 truncate">{quiz.title}</h3>
                <p className="text-foreground/70 text-sm mb-4 line-clamp-2">
                  {quiz.description || 'No description'}
                </p>
                <div className="flex items-center text-sm text-foreground/50 mb-4">
                  <span>{quiz.questions?.length || 0} questions</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/session/new?quiz=${quiz.id}`)}
                    className="btn-primary flex-1 flex items-center justify-center gap-1 py-2"
                    title="Start game"
                  >
                    <Icon path={mdiPlay} size={0.8} />
                    Play
                  </button>
                  <button
                    onClick={() => router.push(`/quiz/${quiz.id}`)}
                    className="p-2 rounded-lg bg-card-bg border border-card-border hover:bg-primary/10 hover:border-primary transition-colors"
                    title="Edit quiz"
                  >
                    <Icon path={mdiPencil} size={0.8} />
                  </button>
                  {deleteConfirm === quiz.id ? (
                    <button
                      onClick={() => handleDeleteQuiz(quiz.id!)}
                      className="p-2 rounded-lg bg-error text-white hover:bg-error/80 transition-colors"
                      title="Confirm delete"
                    >
                      <Icon path={mdiDelete} size={0.8} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(quiz.id!)}
                      className="p-2 rounded-lg bg-card-bg border border-card-border hover:bg-error/10 hover:border-error transition-colors"
                      title="Delete quiz"
                    >
                      <Icon path={mdiDelete} size={0.8} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
