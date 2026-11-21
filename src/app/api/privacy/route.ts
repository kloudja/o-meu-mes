import type { NextRequest } from 'next/server';
import { spaceRoute } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: NextRequest) => spaceRoute(request, 'privacy');
export const POST = GET;
