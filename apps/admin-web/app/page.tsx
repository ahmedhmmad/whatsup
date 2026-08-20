'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';

export default function Home() {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else router.replace(user.role === 'super_admin' ? '/admin/organizations' : '/dashboard');
  }, [user, loading, router]);

  return <div className="p-8 text-sm text-slate-500">Loading…</div>;
}
