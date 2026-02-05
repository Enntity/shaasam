import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secret, {
      apiVersion: '2023-10-16',
    });
  }
  return stripeClient;
}
