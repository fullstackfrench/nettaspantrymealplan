-- Sample meals so the site has something to show before your chef adds her own.
-- Run after schema.sql. Replace image_url values with real photos.

insert into meals (slug, name, subtitle, description, chef_name, image_url, price_cents,
                   calories, protein_g, carbs_g, fat_g, ingredients, allergen_free, tags)
values
('seared-shrimp-quinoa-bowl',
 'Seared Shrimp & Quinoa Bowl',
 'with Creamy Avocado Sauce',
 'Plump shrimp marinated in warm spices and lime, paired with nutty tri-color quinoa, oven-roasted Brussels sprouts, and a creamy avocado sauce drizzled on top.',
 'Chef Netta', null, 1450, 520, 34, 45, 21,
 array['Shrimp','Tri-color Quinoa','Brussels Sprouts','Cherry Tomato','Avocado','Lime Juice','Cumin','Chili Powder','Garlic','Cilantro','Olive Oil','Kosher Salt','Black Pepper'],
 array['Gluten Free','Dairy Free','Tree Nut Free','Peanut Free','Soy Free'],
 array['seafood','gluten-free','dairy-free','high-protein','under-600']),

('carolina-braised-chicken',
 'Carolina Braised Chicken',
 'with Stone-Ground Grits & Collards',
 'Bone-in thighs braised low and slow with local cider vinegar, served over creamy stone-ground grits and garlicky collard greens.',
 'Chef Netta', null, 1395, 610, 38, 42, 28,
 array['Chicken Thigh','Stone-Ground Grits','Collard Greens','Apple Cider Vinegar','Onion','Garlic','Butter','Smoked Paprika','Kosher Salt','Black Pepper'],
 array['Gluten Free','Tree Nut Free','Peanut Free','Soy Free'],
 array['poultry','gluten-free','high-protein']),

('sweet-potato-black-bean-bowl',
 'Sweet Potato & Black Bean Bowl',
 'with Charred Corn & Lime Crema',
 'Roasted North Carolina sweet potatoes over cilantro rice with black beans, charred corn, and a bright cashew lime crema.',
 'Chef Netta', null, 1295, 540, 18, 78, 16,
 array['Sweet Potato','Black Beans','Jasmine Rice','Corn','Cashew','Lime Juice','Cilantro','Cumin','Olive Oil','Kosher Salt'],
 array['Gluten Free','Dairy Free','Soy Free'],
 array['vegan','vegetarian','gluten-free','dairy-free']),

('herb-crusted-salmon',
 'Herb-Crusted Salmon',
 'with Lemon Farro & Asparagus',
 'Atlantic salmon under a dill and parsley crust, with lemony farro and blistered asparagus.',
 'Chef Netta', null, 1650, 580, 41, 38, 27,
 array['Salmon','Farro','Asparagus','Dill','Parsley','Lemon','Garlic','Olive Oil','Kosher Salt','Black Pepper'],
 array['Dairy Free','Tree Nut Free','Peanut Free','Soy Free'],
 array['seafood','high-protein','under-600']),

('short-rib-ragu',
 'Braised Short Rib Ragù',
 'over Creamy Polenta',
 'Beef short rib braised for six hours in red wine and tomato, spooned over parmesan polenta.',
 'Chef Netta', null, 1750, 720, 44, 46, 38,
 array['Beef Short Rib','Polenta','San Marzano Tomato','Red Wine','Carrot','Celery','Onion','Parmesan','Garlic','Rosemary','Olive Oil'],
 array['Gluten Free','Tree Nut Free','Peanut Free','Soy Free'],
 array['beef','gluten-free','high-protein']),

('spring-vegetable-orzo',
 'Spring Vegetable Orzo',
 'with Whipped Feta & Mint',
 'Toasted orzo tossed with English peas, zucchini, and lemon, over whipped feta with torn mint.',
 'Chef Netta', null, 1295, 495, 17, 62, 18,
 array['Orzo','English Peas','Zucchini','Feta','Mint','Lemon','Shallot','Olive Oil','Kosher Salt'],
 array['Tree Nut Free','Peanut Free','Soy Free'],
 array['vegetarian','under-600']);
