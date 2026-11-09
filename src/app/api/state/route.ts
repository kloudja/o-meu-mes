import { handleGet, handlePost } from '@/server/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>handleGet(request);
export const POST=(request:Request)=>handlePost(request);
