const fs = require('fs');

const brands = ['apple', 'samsung', 'sony', 'nike', 'adidas', 'google', 'microsoft', 'dell', 'hp', 'lenovo', 'asus'];
const products = ['laptop', 'phone', 'headphones', 'charger', 'case', 'shoes', 'watch', 'tablet', 'monitor', 'keyboard', 'mouse'];
const attributes = ['wireless', 'bluetooth', 'pro', 'max', 'usb-c', 'gaming', 'mechanical', 'smart', 'portable', 'refurbished', 'new'];

const dataset = [];
const uniqueQueries = new Set();

// Generate combinations
for (const brand of brands) {
    for (const product of products) {
        for (const attr of attributes) {
            // Add different variations of the same search
            const variations = [
                `${brand} ${product}`,
                `${brand} ${product} ${attr}`,
                `${attr} ${product}`,
                `best ${brand} ${product}`
            ];

            variations.forEach(query => {
                if (!uniqueQueries.has(query)) {
                    uniqueQueries.add(query);
                    dataset.push({
                        query: query,
                        // Random count heavily weighted to simulate trending vs rare searches
                        count: Math.floor(Math.random() * 50000) + 100 
                    });
                }
            });
        }
    }
}

// Fill the rest with numbered variations to hit the 100k mark quickly
let counter = 0;
while (dataset.length < 105000) {
    dataset.push({
        query: `software tutorial part ${counter}`,
        count: Math.floor(Math.random() * 500) + 10
    });
    counter++;
}

// Sort by count descending to match realistic DB state
dataset.sort((a, b) => b.count - a.count);

fs.writeFileSync('dataset.json', JSON.stringify(dataset, null, 2));
console.log(`Successfully generated ${dataset.length} queries in dataset.json!`);