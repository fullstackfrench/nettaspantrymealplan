const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const moduleExports = {};
const source = fs.readFileSync(path.join(__dirname, '../src/lib/admin-meal-categories.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: moduleExports });
const { getAdminMealCategory, matchesAdminMealSearch, isAdminMealCategoryTag } = moduleExports;
const meal = { name: 'Steak Southwest Salad', subtitle: 'with Lime', description: 'Fresh quinoa and vegetables', ingredients: ['Avocado', 'Cilantro'], tags: ['beef'], is_active: false };

test('search finds hidden meals by name, ingredient, description and existing tags', () => {
  for (const query of ['steak', 'CILANTRO', 'quinoa', 'beef', 'steak avocado']) assert.equal(matchesAdminMealSearch(meal, query), true);
  assert.equal(matchesAdminMealSearch(meal, 'steak chicken'), false);
  assert.equal(matchesAdminMealSearch(meal, '   '), true);
});

test('search handles accents and absent subtitles or descriptions', () => {
  assert.equal(matchesAdminMealSearch({ ...meal, name: 'Ragù', subtitle: null, description: null }, 'ragu'), true);
});

test('existing dishes receive broad categories without dietary inference', () => {
  const examples = { 'Lo Mein Veggies': 'main-dishes', 'Steak Southwest Salad': 'salads-bowls', 'Chicken & Waffles': 'breakfast', 'Garlicky Green Beans': 'sides', 'Apple Cinnamon Chia Pudding': 'desserts', 'Gazpacho Soup': 'soups' };
  for (const [name, category] of Object.entries(examples)) assert.equal(getAdminMealCategory({ name, tags: [] }), category);
});

test('saved categories override suggestions and can explicitly be uncategorized', () => {
  assert.equal(getAdminMealCategory({ ...meal, tags: ['beef', 'main-dishes'] }), 'main-dishes');
  assert.equal(getAdminMealCategory({ ...meal, tags: ['uncategorized'] }), 'uncategorized');
  assert.equal(isAdminMealCategoryTag('main-dishes'), true);
  assert.equal(isAdminMealCategoryTag('uncategorized'), true);
  assert.equal(isAdminMealCategoryTag('gluten-free'), false);
});

test('saving an assigned category preserves dietary tags and replaces the prior category', async () => {
  const writes = [];
  const client = { from(table) {
    let operation = 'select', values;
    const query = {
      select() { return query; }, eq() { return query; },
      update(row) { operation = 'update'; values = row; return query; },
      maybeSingle: async () => ({ data: { id: 'bb528962-4158-47bb-81e0-b397bf371263' }, error: null }),
      then(resolve) {
        if (operation === 'update') writes.push({ table, values });
        return Promise.resolve({ data: operation === 'select' ? [] : null, error: null }).then(resolve);
      },
    };
    return query;
  } };
  const actions = {};
  const actionSource = fs.readFileSync(path.join(__dirname, '../src/app/admin/actions.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(actionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: actions,
    require(name) {
      if (name.includes('admin-meal-categories')) return moduleExports;
      if (name.includes('require-admin')) return { requireAdmin: async () => client };
      if (name === 'next/cache') return { revalidatePath() {} };
      if (name === 'crypto') return require('node:crypto');
      return {};
    },
    console, Date, Set, Map,
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({ id: 'bb528962-4158-47bb-81e0-b397bf371263', name: meal.name, price: '40.00', category: 'main-dishes', tags: 'beef, gluten-free, sides' })) form.set(key, value);
  await actions.saveMeal(form);
  assert.deepEqual(Array.from(writes.find((write) => write.table === 'meals').values.tags), ['beef', 'gluten-free', 'main-dishes']);
  writes.length = 0;
  form.set('category', 'invalid-category');
  await assert.rejects(actions.saveMeal(form), /valid meal category/);
  assert.equal(writes.length, 0);
});
