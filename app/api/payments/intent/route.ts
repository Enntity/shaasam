import { createPayment } from '@/lib/payments';
export const runtime = 'nodejs';
export function POST(request: Request) { return createPayment(request, 'intent'); }
