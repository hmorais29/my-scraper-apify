const { Actor } = require('apify');
const { RequestQueue, PuppeteerCrawler, Dataset } = require('crawlee');

const main = async () => {
    await Actor.init();
    
    const input = await Actor.getInput();
    console.log('📥 Input recebido:', input);
    
    const query = input.query || input.searchQuery || '';
    
    if (!query) {
        console.log('❌ Nenhuma query fornecida');
        await Actor.exit();
        return;
    }
    
    console.log(`🔍 Query: "${query}"`);
    
    const searchCriteria = parseQuery(query);
    console.log('📋 Critérios extraídos:', searchCriteria);
    
    const propertySites = [
        {
            name: 'Casa Sapo',
            baseUrl: 'https://casa.sapo.pt',
            buildSearchUrl: (criteria) => buildCasaSapoUrl(criteria),
            selectors: {
                container: '.searchResultProperty, .property-item, .casa-info, [data-cy="property"], .listing-item',
                title: '.propertyTitle a, h2 a, .title a, .casa-title, [data-cy="title"], .listing-title a',
                price: '.propertyPrice, .price, .valor, [data-cy="price"], .listing-price',
                location: '.propertyLocation, .location, .zona, [data-cy="location"], .listing-address',
                area: '.area, .metros, [class*="area"], [class*="m2"], .listing-area',
                rooms: '.quartos, .rooms, [class*="quarto"], .tipologia, .listing-rooms'
            },
            antiBot: true
        },
        {
            name: 'Imovirtual',
            baseUrl: 'https://www.imovirtual.com',
            buildSearchUrl: (criteria) => buildImovirtualUrl(criteria),
            selectors: {
                container: 'article, [data-cy="listing-item"], .offer-item, .property-item, .css-1sw7q4x, .css-15mp5m2',
                title: 'a[title], h2 a, h3 a, [data-cy="listing-item-link"], .offer-item-title a, .css-16vl3c1 a, .css-1as8ukw',
                price: '.css-1uwck7i, [data-cy="price"], .offer-item-price, .price, [class*="price"], .css-zcebfu',
                location: '.css-12h460f, [data-cy="location"], .offer-item-location, .location, .css-wmoe9r',
                area: '.css-1wi9dc7, .offer-item-area, [data-cy="area"], .area, [class*="area"]',
                rooms: '.css-1wi9dc7, .offer-item-rooms, [data-cy="rooms"], .rooms, [class*="rooms"]'
            },
            antiBot: true
        },
        {
            name: 'ERA Portugal',
            baseUrl: 'https://www.era.pt',
            buildSearchUrl: (criteria) => buildEraUrl(criteria),
            selectors: {
                container: '.property-card, .listing-card, .property-item, .card, .listing-item, [class*="property"], [class*="listing"]',
                title: '.property-title a, h2 a, h3 a, .card-title a, .listing-title a, [class*="title"] a',
                price: '.property-price, .price, .valor, .card-price, .listing-price, [class*="price"]',
                location: '.property-location, .location, .address, .card-location, .listing-address, [class*="location"]',
                area: '.property-area, .area, .metros, .card-area, .listing-area, [class*="area"]',
                rooms: '.property-rooms, .tipologia, .quartos, .card-rooms, .listing-rooms, [class*="rooms"]'
            },
            antiBot: true
        },
        {
            name: 'Remax Portugal',
            baseUrl: 'https://www.remax.pt',
            buildSearchUrl: (criteria) => buildRemaxUrl(criteria),
            selectors: {
                container: '.property-card, .listing-item, .property-box, .real-estate-item, [class*="property"], [class*="listing"], .card',
                title: '.property-title, h2 a, h3 a, .listing-title a, [class*="title"] a, .card-title a',
                price: '.property-price, .price-amount, .listing-price, [class*="price"], .card-price',
                location: '.property-address, .location, .listing-address, [class*="location"], .card-address',
                area: '.property-area, .area, .listing-area, [class*="area"], .card-area',
                rooms: '.property-rooms, .rooms, .tipologia, [class*="bedroom"], .card-rooms, .listing-rooms'
            },
            antiBot: true
        },
        {
            name: 'Idealista Portugal',
            baseUrl: 'https://www.idealista.pt',
            buildSearchUrl: (criteria) => buildIdealistaUrl(criteria),
            selectors: {
                container: '.item, .listing-item, .property-card, [class*="item"], [class*="listing"], .card',
                title: '.item-link, h2 a, h3 a, [class*="title"] a, .listing-title a',
                price: '.price-row, .item-price, [class*="price"], .listing-price, .card-price',
                location: '.item-detail-location, .location, [class*="location"], .listing-address, .card-address',
                area: '.item-detail-area, .area, [class*="area"], .listing-area, .card-area',
                rooms: '.item-detail-rooms, .rooms, [class*="bedroom"], .tipologia, .listing-rooms'
            },
            antiBot: true
        }
    ];
    
    const requestQueue = await RequestQueue.open();
    
    for (const site of propertySites) {
        try {
            const searchUrl = site.buildSearchUrl(searchCriteria);
            if (searchUrl) {
                console.log(`🌐 ${site.name}: ${searchUrl}`);
                
                await requestQueue.addRequest({ 
                    url: searchUrl,
                    userData: { 
                        site: site,
                        criteria: searchCriteria,
                        attempt: 1
                    }
                });
            }
        } catch (error) {
            console.log(`❌ Erro ao construir URL para ${site.name}:`, error.message);
        }
    }
    
    const crawler = new PuppeteerCrawler({
        requestQueue,
        maxRequestRetries: 6,
        maxConcurrency: 1,
        minConcurrency: 1,
        maxRequestsPerMinute: 8, // Reduced further for safety
        launchContext: {
            launchOptions: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                stealth: true // Enable stealth mode to avoid detection
            }
        },
        preNavigationHooks: [async ({ request, page }, gotoOptions) => {
            await page.setExtraHTTPHeaders(getEnhancedHeaders());
            await page.setViewport({ width: 1280, height: 720 });
            gotoOptions.waitUntil = 'networkidle2';
        }],
        requestHandler: async ({ request, page, response }) => {
            const { site, criteria, attempt } = request.userData;
            
            console.log(`\n🏠 Processando ${site.name}...`);
            console.log(`📊 Status: ${response.status()}`);
            
            const baseDelay = site.antiBot ? 8000 : 4000;
            const maxDelay = site.antiBot ? 15000 : 8000;
            await randomDelay(baseDelay * attempt, maxDelay * attempt);
            
            if (response.status() === 429 || response.status() === 403) {
                console.log(`🚫 ${site.name} bloqueou o request (${response.status()})`);
                
                if (attempt < 6) {
                    const retryDelay = Math.pow(2, attempt) * 20000; // Even longer backoff
                    console.log(`🔄 Tentando novamente em ${retryDelay/1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    
                    await requestQueue.addRequest({
                        url: request.url,
                        userData: { 
                            ...request.userData, 
                            attempt: attempt + 1 
                        }
                    });
                }
                return;
            }
            
            if (response.status() !== 200) {
                console.log(`❌ ${site.name} - Status: ${response.status()}`);
                return;
            }
            
            console.log(`✅ ${site.name} acessível!`);
            
            // Wait for dynamic content
            try {
                await page.waitForSelector(site.selectors.container, { timeout: 10000 });
            } catch (e) {
                console.log(`⚠️ Timeout waiting for containers in ${site.name}`);
            }
            
            const properties = await page.evaluate((site, criteria, sourceUrl) => {
                const properties = [];
                
                const containers = document.querySelectorAll(site.selectors.container);
                
                containers.forEach((el, i) => {
                    if (i >= 8) return;
                    
                    const property = {
                        title: '',
                        price: '',
                        location: '',
                        area: '',
                        rooms: '',
                        link: '',
                        source: site.name,
                        sourceUrl: sourceUrl,
                        scrapedAt: new Date().toISOString()
                    };
                    
                    const titleSelectors = site.selectors.title.split(', ');
                    for (const selector of titleSelectors) {
                        const el = document.querySelector(selector);
                        if (el) {
                            const text = el.getAttribute('title') || el.textContent.trim();
                            const href = el.getAttribute('href') || el.querySelector('a')?.getAttribute('href');
                            
                            if (text && text.length > 10 && !text.toLowerCase().includes('javascript')) {
                                property.title = text.substring(0, 200);
                                if (href && href !== '#' && !href.startsWith('javascript')) {
                                    property.link = href.startsWith('http') ? href : site.baseUrl + href;
                                }
                                break;
                            }
                        }
                    }
                    
                    const priceSelectors = site.selectors.price.split(', ');
                    for (const selector of priceSelectors) {
                        const el = document.querySelector(selector);
                        if (el) {
                            const text = el.textContent.trim();
                            if (text && (text.includes('€') || text.match(/\d{3}\.\d{3}/) || text.match(/\d{6,}/))) {
                                property.price = text.substring(0, 50);
                                break;
                            }
                        }
                    }
                    
                    const locationSelectors = site.selectors.location.split(', ');
                    for (const selector of locationSelectors) {
                        const el = document.querySelector(selector);
                        if (el) {
                            const text = el.textContent.trim();
                            if (text && text.length > 2 && text.length < 100 && 
                                !text.includes('€') && !text.match(/^\d+$/)) {
                                property.location = text.substring(0, 100);
                                break;
                            }
                        }
                    }
                    
                    const areaSelectors = site.selectors.area.split(', ');
                    for (const selector of areaSelectors) {
                        const el = document.querySelector(selector);
                        if (el) {
                            const text = el.textContent.trim();
                            if (text && text.match(/\d+.*m[²2]/i)) {
                                property.area = text.substring(0, 20);
                                break;
                            }
                        }
                    }
                    
                    const roomsSelectors = site.selectors.rooms.split(', ');
                    for (const selector of roomsSelectors) {
                        const el = document.querySelector(selector);
                        if (el) {
                            const text = el.textContent.trim();
                            if (text && (text.match(/t\d/i) || text.match(/\d.*quarto/i))) {
                                property.rooms = text.substring(0, 10);
                                break;
                            }
                        }
                    }
                    
                    if (property.title && property.title.length > 15 && 
                        (property.price || property.location)) {
                        properties.push(property);
                    }
                });
                
                return properties;
            }, site, criteria, request.url);
            
            const filteredProperties = properties.filter(prop => isPropertyRelevant(prop, criteria));
            
            if (filteredProperties.length > 0) {
                console.log(`📊 ${site.name}: ${filteredProperties.length} imóveis encontrados`);
                
                const limitedProperties = filteredProperties.slice(0, 5);
                
                limitedProperties.slice(0, 2).forEach((prop, i) => {
                    console.log(`\n🏡 ${site.name} - Imóvel ${i + 1}:`);
                    console.log(`  📝 ${prop.title.substring(0, 60)}...`);
                    console.log(`  💰 ${prop.price}`);
                    console.log(`  📍 ${prop.location}`);
                    if (prop.area) console.log(`  📏 ${prop.area}`);
                    if (prop.rooms) console.log(`  🚪 ${prop.rooms}`);
                });
                
                await Dataset.pushData(limitedProperties);
            } else {
                console.log(`❌ ${site.name}: Nenhum imóvel encontrado`);
                await debugPageStructure(page, site);
            }
        },
        
        failedRequestHandler: async ({ request, error }) => {
            console.log(`❌ Falha em ${request.userData.site.name}: ${error.message}`);
        },
    });
    
    console.log('\n🚀 Iniciando scraping...');
    await crawler.run();
    
    const dataset = await Dataset.open();
    const data = await dataset.getData();
    const totalProperties = data.items.length;
    
    console.log(`\n🎉 Scraping concluído!`);
    console.log(`📊 Total de imóveis encontrados: ${totalProperties}`);
    
    const bySite = {};
    data.items.forEach(item => {
        bySite[item.source] = (bySite[item.source] || 0) + 1;
    });
    
    console.log('\n📈 Resultados por site:');
    Object.entries(bySite).forEach(([site, count]) => {
        console.log(`  ${site}: ${count} imóveis`);
    });
    
    await Actor.exit();
};

function parseQuery(query) {
    const criteria = {
        location: '',
        rooms: '',
        area: '',
        condition: '',
        type: 'apartamento'
    };
    
    const queryLower = query.toLowerCase();
    
    const roomsMatch = queryLower.match(/t(\d+)/);
    if (roomsMatch) {
        criteria.rooms = `T${roomsMatch[1]}`;
    }
    
    const areaMatch = queryLower.match(/(\d+)\s*m[2²]?/);
    if (areaMatch) {
        criteria.area = parseInt(areaMatch[1]);
    }
    
    const locations = [
        'lisboa', 'porto', 'cascais', 'sintra', 'almada', 'amadora',
        'oeiras', 'loures', 'odivelas', 'vila nova de gaia', 'matosinhos',
        'braga', 'coimbra', 'aveiro', 'setúbal', 'évora', 'faro',
        'funchal', 'viseu', 'leiria', 'santarém', 'beja', 'castelo branco',
        'guarda', 'portalegre', 'vila real', 'bragança', 'viana do castelo'
    ];
    
    for (const loc of locations) {
        if (queryLower.includes(loc)) {
            criteria.location = loc;
            break;
        }
    }
    
    const conditions = ['novo', 'renovado', 'para renovar', 'usado', 'recente'];
    for (const cond of conditions) {
        if (queryLower.includes(cond)) {
            criteria.condition = cond;
            break;
        }
    }
    
    if (queryLower.includes('moradia') || queryLower.includes('casa')) {
        criteria.type = 'moradia';
    } else if (queryLower.includes('apartamento') || queryLower.includes('apto')) {
        criteria.type = 'apartamento';
    }
    
    return criteria;
}

function buildCasaSapoUrl(criteria) {
    let url = 'https://casa.sapo.pt/venda';
    
    if (criteria.type === 'apartamento') {
        url += '/apartamentos';
    } else if (criteria.type === 'moradia') {
        url += '/moradias';
    }
    
    if (criteria.location) {
        url += `/${criteria.location}`;
    }
    
    const params = new URLSearchParams();
    
    if (criteria.rooms) {
        const roomNum = criteria.rooms.replace('T', '');
        params.append('quartos', roomNum);
    }
    
    if (criteria.area) {
        params.append('area_min', Math.max(1, criteria.area - 20));
        params.append('area_max', criteria.area + 20);
    }
    
    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
}

function buildImovirtualUrl(criteria) {
    let url = 'https://www.imovirtual.com/comprar';
    
    if (criteria.type === 'apartamento') {
        url += '/apartamento';
    } else if (criteria.type === 'moradia') {
        url += '/moradia';
    }
    
    if (criteria.location) {
        url += `/${criteria.location}`;
    }
    
    const params = new URLSearchParams();
    
    if (criteria.rooms) {
        const roomNum = criteria.rooms.replace('T', '');
        params.append('search%5Bfilter_float_number_of_rooms%3Afrom%5D', roomNum);
        params.append('search%5Bfilter_float_number_of_rooms%3Ato%5D', roomNum);
    }
    
    if (criteria.area) {
        params.append('search%5Bfilter_float_m%3Afrom%5D', Math.max(1, criteria.area - 20));
        params.append('search%5Bfilter_float_m%3Ato%5D', criteria.area + 20);
    }
    
    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
}

function buildEraUrl(criteria) {
    let url = 'https://www.era.pt/comprar';
    
    if (criteria.type === 'apartamento') {
        url += '/apartamentos';
    } else if (criteria.type === 'moradia') {
        url += '/moradias';
    }
    
    if (criteria.location) {
        url += `/${criteria.location}`;
    }
    
    return url;
}

function buildRemaxUrl(criteria) {
    let url = 'https://www.remax.pt/comprar';
    
    if (criteria.type === 'apartamento') {
        url += '/apartamentos';
    } else if (criteria.type === 'moradia') {
        url += '/casas';
    }
    
    if (criteria.location) {
        url += `/${criteria.location.toLowerCase().replace(/\s+/g, '-')}`;
    }
    
    const params = new URLSearchParams();
    
    if (criteria.rooms) {
        const roomNum = criteria.rooms.replace('T', '');
        params.append('bedrooms', roomNum);
    }
    
    if (criteria.area) {
        params.append('areaMin', Math.max(1, criteria.area - 20));
        params.append('areaMax', criteria.area + 20);
    }
    
    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
}

function buildIdealistaUrl(criteria) {
    let url = 'https://www.idealista.pt/comprar-casas';
    
    if (criteria.location) {
        url += `/${criteria.location.toLowerCase().replace(/\s+/g, '-')}`;
    }
    
    const params = new URLSearchParams();
    
    if (criteria.type === 'apartamento') {
        params.append('tipologia', 'apartamentos');
    } else if (criteria.type === 'moradia') {
        params.append('tipologia', 'moradias');
    }
    
    if (criteria.rooms) {
        const roomNum = criteria.rooms.replace('T', '');
        params.append('quartos', roomNum);
    }
    
    if (criteria.area) {
        params.append('area_min', Math.max(1, criteria.area - 20));
        params.append('area_max', criteria.area + 20);
    }
    
    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
}

function getEnhancedHeaders() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/126.0.0.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    ];
    
    return {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8,en-GB;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.google.pt/',
        'DNT': '1',
        'Sec-CH-UA': '"Chromium";v="126", "Not(A:Brand";v="24"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"'
    };
}

function randomDelay(min, max) {
    const delay = Math.random() * (max - min) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

function isPropertyRelevant(property, criteria) {
    if (!criteria.location && !criteria.rooms && !criteria.area) {
        return true;
    }
    
    let relevantCount = 0;
    let totalCriteria = 0;
    
    if (criteria.location) {
        totalCriteria++;
        const propLocation = property.location.toLowerCase();
        const propTitle = property.title.toLowerCase();
        
        if (propLocation.includes(criteria.location) || propTitle.includes(criteria.location)) {
            relevantCount++;
        }
    }
    
    if (criteria.rooms) {
        totalCriteria++;
        const propRooms = property.rooms.toLowerCase();
        const propTitle = property.title.toLowerCase();
        const criteriaRooms = criteria.rooms.toLowerCase();
        const roomNum = parseInt(criteriaRooms.replace('t', ''));
        
        // Allow properties with equal or higher room counts (e.g., T4 or T5+ for T4)
        const propRoomMatch = propRooms.match(/t(\d+)/i) || propTitle.match(/t(\d+)/i);
        if (propRoomMatch) {
            const propRoomNum = parseInt(propRoomMatch[1]);
            if (propRoomNum >= roomNum) {
                relevantCount++;
            }
        } else if (propRooms.includes(criteriaRooms) || propTitle.includes(criteriaRooms)) {
            relevantCount++;
        }
    }
    
    if (criteria.area) {
        totalCriteria++;
        const areaMatch = property.area.match(/(\d+)/) || property.title.match(/(\d+)\s*m[2²]/i);
        
        if (areaMatch) {
            const propArea = parseInt(areaMatch[1]);
            if (propArea && Math.abs(propArea - criteria.area) <= 30) {
                relevantCount++;
            }
        }
    }
    
    return totalCriteria === 0 || (relevantCount / totalCriteria) >= 0.5;
}

function calculateRelevanceScore(property, criteria) {
    let score = 0;
    
    if (criteria.location && property.location.toLowerCase().includes(criteria.location)) {
        score += 15;
    }
    
    if (criteria.rooms) {
        const propRooms = property.rooms.toLowerCase();
        const propTitle = property.title.toLowerCase();
        const criteriaRooms = criteria.rooms.toLowerCase();
        const roomNum = parseInt(criteriaRooms.replace('t', ''));
        
        const propRoomMatch = propRooms.match(/t(\d+)/i) || propTitle.match(/t(\d+)/i);
        if (propRoomMatch) {
            const propRoomNum = parseInt(propRoomMatch[1]);
            if (propRoomNum === roomNum) score += 20;
            else if (propRoomNum > roomNum) score += 15;
        } else if (propRooms.includes(criteriaRooms) || propTitle.includes(criteriaRooms)) {
            score += 15;
        }
    }
    
    if (criteria.area) {
        const areaMatch = property.area.match(/(\d+)/) || property.title.match(/(\d+)\s*m[2²]/i);
        if (areaMatch) {
            const propArea = parseInt(areaMatch[1]);
            const diff = Math.abs(propArea - criteria.area);
            if (diff <= 10) score += 10;
            else if (diff <= 20) score += 5;
            else if (diff <= 30) score += 2;
        }
    }
    
    if (property.price && property.price !== 'N/A') score += 3;
    if (property.location && property.location !== 'N/A') score += 3;
    if (property.area && property.area !== 'N/A') score += 2;
    if (property.rooms && property.rooms !== 'N/A') score += 2;
    if (property.link) score += 2;
    
    return score;
}

async function debugPageStructure(page, site) {
    console.log(`🔍 Debugging ${site.name}:`);
    
    const classCounts = await page.evaluate(() => {
        const counts = {};
        document.querySelectorAll('*[class]').forEach(el => {
            el.classList.forEach(cls => {
                if (cls.length > 2) {
                    counts[cls] = (counts[cls] || 0) + 1;
                }
            });
        });
        return counts;
    });
    
    const topClasses = Object.entries(classCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
    
    console.log('🏆 Top classes:');
    topClasses.forEach(([cls, count]) => {
        console.log(`  .${cls}: ${count}`);
    });
    
    const propertyKeywords = ['apartamento', 'moradia', 'quarto', 't1', 't2', 't3', 't4', '€', 'metro'];
    const textElements = await page.evaluate((keywords) => {
        const elements = [];
        document.querySelectorAll('*').forEach(el => {
            const text = el.textContent.toLowerCase();
            if (keywords.some(keyword => text.includes(keyword)) && text.length < 200) {
                elements.push({
                    tag: el.tagName,
                    class: el.className || '',
                    text: text.substring(0, 100)
                });
            }
        });
        return elements;
    }, propertyKeywords);
    
    console.log(`🏠 Elementos com keywords: ${Math.min(5, textElements.length)}`);
    textElements.slice(0, 5).forEach((el, i) => {
        console.log(`  ${i + 1}. <${el.tag} class="${el.class}">: ${el.text}...`);
    });
}

main().catch(console.error);
