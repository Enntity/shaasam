import { changePayment } from '@/lib/payments';
export const runtime = 'nodejs';
export function POST(request: Request) { return changePayment(request, 'cancel'); }
