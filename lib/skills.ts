import { CATEGORY_OPTIONS } from './categories';

export type SkillOption = {
  id: string;
  label: string;
  categories: string[];
  suggestedRate: number;
};

export const SKILL_OPTIONS: SkillOption[] = [
  { id: 'prompt-engineering', label: 'Prompt engineering', categories: ['prompting'], suggestedRate: 95 },
  { id: 'llm-evaluation', label: 'LLM evaluation', categories: ['research', 'prompting'], suggestedRate: 100 },
  { id: 'agent-workflows', label: 'Agent workflows', categories: ['automation', 'product'], suggestedRate: 110 },
  { id: 'research-briefs', label: 'Research briefs', categories: ['research'], suggestedRate: 85 },
  { id: 'user-research', label: 'User research', categories: ['research', 'product'], suggestedRate: 95 },
  { id: 'data-analysis', label: 'Data analysis', categories: ['data-analysis'], suggestedRate: 90 },
  { id: 'sql-analysis', label: 'SQL analysis', categories: ['data-analysis'], suggestedRate: 85 },
  { id: 'python-automation', label: 'Python automation', categories: ['automation', 'data-analysis'], suggestedRate: 100 },
  { id: 'typescript-node', label: 'TypeScript/Node', categories: ['automation', 'ops'], suggestedRate: 115 },
  { id: 'frontend-ui', label: 'Frontend UI polish', categories: ['design'], suggestedRate: 100 },
  { id: 'design-systems', label: 'Design systems', categories: ['design'], suggestedRate: 110 },
  { id: 'debugging', label: 'Debugging', categories: ['debugging'], suggestedRate: 115 },
  { id: 'qa-testing', label: 'QA testing', categories: ['ops'], suggestedRate: 70 },
  { id: 'devops', label: 'DevOps', categories: ['ops'], suggestedRate: 125 },
  { id: 'security-review', label: 'Security review', categories: ['security'], suggestedRate: 135 },
  { id: 'product-strategy', label: 'Product strategy', categories: ['product'], suggestedRate: 120 },
  { id: 'growth-experiments', label: 'Growth experiments', categories: ['growth'], suggestedRate: 95 },
  { id: 'content-writing', label: 'Content writing', categories: ['content'], suggestedRate: 65 },
  { id: 'customer-support', label: 'Customer support', categories: ['support'], suggestedRate: 55 },
  { id: 'finance-ops', label: 'Finance ops', categories: ['finance'], suggestedRate: 90 },
  { id: 'legal-review', label: 'Legal review', categories: ['legal'], suggestedRate: 145 },
  { id: 'automation-no-code', label: 'Automation (Zapier/Make)', categories: ['automation'], suggestedRate: 85 },
  { id: 'data-labeling-qa', label: 'Data labeling QA', categories: ['data-analysis', 'ops'], suggestedRate: 55 },
  { id: 'generalist-ops', label: 'Generalist / Ops', categories: ['ops'], suggestedRate: 75 },
];

const MAX_SKILLS = 24;
const skillById = new Map(SKILL_OPTIONS.map((skill) => [skill.id, skill]));
const skillByLabel = new Map(
  SKILL_OPTIONS.map((skill) => [skill.label.toLowerCase(), skill])
);
const categoryLabelById = new Map(CATEGORY_OPTIONS.map((category) => [category.id, category.label]));

function resolveSkill(input: string): SkillOption | null {
  const key = input.trim().toLowerCase();
  if (!key) return null;
  return skillById.get(key) || skillByLabel.get(key) || null;
}

export function normalizeSkills(input: unknown): { original: string[]; normalized: string[] } {
  let items: string[] = [];
  if (Array.isArray(input)) {
    items = input.map((item) => String(item));
  } else if (typeof input === 'string') {
    items = input.split(',');
  }

  const resolved = items
    .map((item) => resolveSkill(String(item)))
    .filter((item): item is SkillOption => Boolean(item));

  const uniqueLabels = Array.from(new Set(resolved.map((skill) => skill.label))).slice(0, MAX_SKILLS);
  const normalized = uniqueLabels.map((label) => label.toLowerCase());

  return { original: uniqueLabels, normalized };
}

export function deriveCategoriesFromSkills(skills: string[]): {
  categories: string[];
  normalized: string[];
} {
  const categoryIds = new Set<string>();
  skills
    .map((skill) => resolveSkill(skill))
    .filter((item): item is SkillOption => Boolean(item))
    .forEach((skill) => {
      skill.categories.forEach((cat) => categoryIds.add(cat));
    });

  const normalized = Array.from(categoryIds);
  const categories = normalized.map((id) => categoryLabelById.get(id) || id);
  return { categories, normalized };
}

export function getSuggestedRate(skills: string[]): number | null {
  const resolved = skills
    .map((skill) => resolveSkill(skill))
    .filter((item): item is SkillOption => Boolean(item));
  if (resolved.length === 0) return null;
  const average = resolved.reduce((sum, skill) => sum + skill.suggestedRate, 0) / resolved.length;
  return Math.round(average / 5) * 5;
}
