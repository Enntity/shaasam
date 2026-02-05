export type CategoryOption = {
  id: string;
  label: string;
};

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { id: 'prompting', label: 'Prompting' },
  { id: 'research', label: 'Research' },
  { id: 'data-analysis', label: 'Data analysis' },
  { id: 'debugging', label: 'Debugging' },
  { id: 'design', label: 'Design' },
  { id: 'product', label: 'Product' },
  { id: 'ops', label: 'Ops' },
  { id: 'growth', label: 'Growth' },
  { id: 'content', label: 'Content' },
  { id: 'automation', label: 'Automation' },
  { id: 'security', label: 'Security' },
  { id: 'legal', label: 'Legal' },
  { id: 'finance', label: 'Finance' },
  { id: 'support', label: 'Support' }
];

function toId(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function normalizeCategories(input: unknown): { original: string[]; normalized: string[] } {
  let items: string[] = [];
  if (Array.isArray(input)) {
    items = input.map((item) => String(item));
  } else if (typeof input === 'string') {
    items = input.split(',');
  }

  const cleaned = items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);

  const normalized = Array.from(
    new Set(
      cleaned
        .map((item) => toId(item))
        .filter(Boolean)
    )
  );

  return { original: cleaned, normalized };
}
