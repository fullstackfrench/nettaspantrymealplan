-- New meals from the June 2026 photo shoot / cooking class.
-- Run in Supabase SQL Editor (Dashboard > SQL Editor), same as seed.sql.
--
-- price_cents is left at the schema default (1350) and calories/protein_g/
-- carbs_g/fat_g/allergen_free are left blank on purpose — Chef Netta hasn't
-- set real prices yet, and allergen badges must come from her, not a guess
-- off a photo. is_active is false so none of these can appear on the public
-- menu or be ordered until she reviews and flips them on in /admin.

insert into meals (slug, name, subtitle, description, chef_name, ingredients, tags, is_active)
values

('caprese-salad',
 'Caprese Salad',
 'with Basil & Balsamic',
 'Layers of fresh mozzarella and vine tomatoes over sweet basil, finished with a balsamic drizzle and cracked black pepper.',
 'Chef Netta',
 array['Mozzarella','Tomato','Basil','Balsamic Glaze','Olive Oil','Sea Salt','Black Pepper'],
 array['vegetarian','gluten-free'],
 false),

('summer-veggie-pasta',
 'Summer Veggie Pasta',
 'with Zucchini, Squash Blossom & Parmesan',
 'Rotini tossed with garden zucchini, squash blossom, and cherry tomato, finished with shaved parmesan.',
 'Chef Netta',
 array['Rotini Pasta','Zucchini','Squash Blossom','Cherry Tomato','Parmesan','Olive Oil','Garlic','Black Pepper'],
 array['vegetarian'],
 false),

('squash-casserole',
 'Squash Casserole',
 'with Buttery Herb Topping',
 'Tender yellow squash baked in a creamy custard under a buttery, golden topping — a Southern potluck staple.',
 'Chef Netta',
 array['Yellow Squash','Onion','Butter','Breadcrumbs','Cheddar Cheese','Egg','Black Pepper'],
 array['vegetarian'],
 false),

('broccoli-salad',
 'Broccoli Salad',
 'with Cheddar, Cranberry & Sunflower Seed',
 'Crisp broccoli tossed with sharp cheddar, dried cranberries, red onion, and sunflower seeds in a creamy dressing.',
 'Chef Netta',
 array['Broccoli','Cheddar Cheese','Dried Cranberries','Red Onion','Sunflower Seeds','Mayonnaise','Apple Cider Vinegar','Sugar'],
 array['vegetarian','gluten-free'],
 false),

-- NAME UNCONFIRMED — the photo between Broccoli Salad and Garlicky Green
-- Beans (baked chicken with peppers, herbs, and scallion) never got a name
-- from the photo folder. Rename the slug/name/subtitle once Chef Netta
-- confirms what this dish is actually called.
('herb-baked-chicken-tbd',
 'Herb-Baked Chicken (name TBD)',
 'with Peppers & Scallion',
 'Baked chicken finished with fresh herbs, sweet peppers, and scallion. Placeholder name — confirm with chef and rename.',
 'Chef Netta',
 array['Chicken','Bell Pepper','Scallion','Herbs','Olive Oil','Black Pepper'],
 array['poultry'],
 false),

('garlicky-green-beans',
 'Garlicky Green Beans',
 'with Roasted Garlic',
 'Snapped green beans sautéed with plenty of roasted garlic, olive oil, and cracked pepper.',
 'Chef Netta',
 array['Green Beans','Garlic','Olive Oil','Sea Salt','Black Pepper'],
 array['vegan','vegetarian','gluten-free','dairy-free'],
 false),

('summer-veggie-pasta-salad',
 'Summer Veggie Pasta Salad',
 'with Feta, Olive & Cucumber',
 'Rigatoni tossed Greek-style with cucumber, tomato, broccoli, kalamata olives, and crumbled feta.',
 'Chef Netta',
 array['Rigatoni Pasta','Cucumber','Tomato','Broccoli','Kalamata Olives','Feta Cheese','Greek Dressing'],
 array['vegetarian'],
 false),

('southern-deviled-eggs',
 'Southern Deviled Eggs',
 'with Fresh Dill',
 'Classic deviled eggs whipped smooth and topped with fresh dill.',
 'Chef Netta',
 array['Egg','Mayonnaise','Mustard','Paprika','Fresh Dill','Salt','Black Pepper'],
 array['vegetarian','gluten-free'],
 false),

('buttermilk-fried-chicken',
 'Buttermilk Fried Chicken',
 'Chef Netta''s Classic',
 'Bone-in chicken soaked in buttermilk, seasoned, and fried golden — a Netta''s Pantry signature.',
 'Chef Netta',
 array['Chicken','Buttermilk','Flour','Paprika','Garlic Powder','Black Pepper','Frying Oil'],
 array['poultry'],
 false),

('cajun-farm-corn',
 'Cajun Farm Corn',
 'with Cajun Butter',
 'Sweet corn on the cob finished with a spiced Cajun butter.',
 'Chef Netta',
 array['Corn','Butter','Cajun Seasoning'],
 array['vegetarian','gluten-free'],
 false),

('lo-mein-veggies',
 'Lo Mein Veggies',
 'with Mushroom, Broccoli & Scallion',
 'Stir-fried noodles with mushroom, broccoli, and scallion in a savory garlic sauce.',
 'Chef Netta',
 array['Lo Mein Noodles','Mushroom','Broccoli','Scallion','Garlic','Soy Sauce','Sesame Oil'],
 array['vegetarian'],
 false),

('apple-granola-chia-pudding',
 'Apple Granola Chia Pudding',
 'with Toasted Oat Granola',
 'Creamy chia pudding layered with spiced apple and finished with toasted oat granola.',
 'Chef Netta',
 array['Chia Seeds','Milk','Apple','Cinnamon','Oat Granola','Honey'],
 array['vegetarian'],
 false),

('steak-southwest-salad',
 'Steak Southwest Salad',
 'with Grilled Steak & Tortilla Strips',
 'Grilled steak sliced over crisp romaine with sweet corn, scallion, and crunchy tortilla strips.',
 'Chef Netta',
 array['Steak','Romaine Lettuce','Corn','Scallion','Tortilla Strips','Southwest Dressing'],
 array['beef'],
 false),

('apricot-orange-chicken',
 'Apricot Orange Chicken',
 'with Apricot-Orange Glaze',
 'Chicken thighs baked in a sweet apricot-orange glaze and finished with fresh scallion.',
 'Chef Netta',
 array['Chicken Thigh','Apricot Preserves','Orange Juice','Scallion','Garlic','Ginger'],
 array['poultry'],
 false)

on conflict (slug) do nothing;
