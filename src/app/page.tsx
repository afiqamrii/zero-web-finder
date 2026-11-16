import Dashboard from '@/components/workspace/Dashboard';
import { Suspense } from 'react';
import { Loading } from '@/components/workspace/shared';
export default function Home() { return <Suspense fallback={<Loading />}><Dashboard /></Suspense>; }
