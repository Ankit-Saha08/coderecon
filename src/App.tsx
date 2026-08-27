import { useEffect } from 'react';
import { useReconStore } from '@/store/useReconStore';
import UploadScreen from '@/components/UploadScreen';
import OverviewScreen from '@/components/OverviewScreen';
import ReconcileScreen from '@/components/ReconcileScreen';
import ExportScreen from '@/components/ExportScreen';

export default function App() {
  const screen = useReconStore((s) => s.screen);
  const entries = useReconStore((s) => s.entries);

  // Refresh protection once real work exists.
  useEffect(() => {
    if (!entries.length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [entries.length]);

  if (screen === 'reconcile') return <ReconcileScreen />;

  return (
    <div className="min-h-full overflow-auto">
      {screen === 'export'   && <ExportScreen />}
      {screen === 'overview' && <OverviewScreen />}
      {screen === 'upload'   && <UploadScreen />}
    </div>
  );
}