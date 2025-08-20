const { Actor } = require('apify');
const { RequestQueue, CheerioCrawler, Dataset } = require('crawlee');

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
                container: '.searchResultProperty, .property-item, .casa-info, [data-cy="property"]',
                title: '.propertyTitle a, h2 a, .title a, .casa-title, [data-cy="title"]',
                price: '.propertyPrice, .price, .valor, [data-cy="price"]',
                location: '.propertyLocation, .location, .zona, [data-cy="location"]',
                area: '.area, .metros, [class*="area"], [class*="m2"]',
                rooms: '.quartos, .rooms, [class*="quarto"], .tipologia'
            }
        },
        {
            name: 'Imovirtual',
            baseUrl: 'https://www.imovirtual.com',
            buildSearchUrl: (criteria) => buildImovirtualUrl(criteria),
            selectors: {
                container: 'article, [data-cy="listing-item"], .offer-item, .property-item, .css-1sw7q4x',
                title: 'a[title], h2 a, h3 a, [data-cy="listing-item-link"], .offer-item-title a, .css-16vl3c1 a',
                price: '.css-1uwck7i, [data-cy="price"], .offer-item-price, .price, [class*="price"]',
                location: '.css-12h460f, [data-cy="location"], .offer-item-location, .location',
                area: '.css-1wi9dc7, .offer-item-area, [data-cy="area"], .area, [class*="area"]',
                rooms: '.css-1wi9dc7, .offer-item-rooms, [data-cy="rooms"], .rooms, [class*="rooms"]'
            }
        },
        {
            name: 'ERA Portugal',
            baseUrl: 'https://www.era.pt',
            buildSearchUrl: (criteria) => buildEraUrl(criteria),
            selectors: {
                container: '.property-card, .listing-card, .property-item, .card',
                title: '.property-title a, h2 a, h3 a, .card-title a',
                price: '.property-price, .price, .valor, .card-price',
                location: '.property-location, .location, .address, .card-location',
                area: '.property-area, .area, .metros, .card-area',
                rooms: '.property-rooms, .tipologia, .quartos, .card-rooms'
            }
        },
        {
            name: 'Remax Portugal',
            baseUrl: 'https://www.remax.pt',
            buildSearchUrl: (criteria) => buildRemaxUrl(criteria),
            selectors: {
                container: '.property-card, .listing-item, .property-box, .real-estate-item',
                title: '.property-title, h2 a, h3 a, .listing-title a',
                price: '.property-price, .price-amount, .listing-price, [class*="price"]',
                location: '.property-address, .location, .listing-address, [class*="location"]',
                area: '.property-area, .area, .listing-area, [class*="area"]',
                rooms: '.property-rooms, .rooms, .tipologia, [class*="bedroom"]'
            }
        },
        {
            name: 'Idealista Portugal',
            baseUrl: 'https://www.idealista.pt',
            buildSearchUrl: (criteria) => buildIdealistaUrl(criteria),
            selectors: {
                container: '.item, .listing-item, .property-card, [class*="item"]',
                title: '.item-link, h2 a, h3 a, [class*="title"] a',
                price: '.price-row, .item-price, [class*="price"], .listing-price',
                location: '.item-detail-location, .location, [class*="location"], .listing-address',
                area: '.item-detail-area, .area, [class*="area"], .listing-area',
                rooms: '.item-detail-rooms, .rooms, [class*="bedroom"], .tipologia'
            },
            antiBot: true // Flag to enable anti-bot measures
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
                    },
                    headers: site.antiBot ? getEnhancedHeaders() : getRandomHeaders()
                    // Uncomment if using Apify proxy
                    // proxyConfiguration: site.antiBot ? { useApifyProxy: true } : undefined
                });
            }
        } catch (error) {
            console.log(`❌ Erro ao construir URL para ${site.name}:`, error.message);
        }
    }
    
    const crawler = new CheerioCrawler({
        requestQueue,
        maxRequestRetries: 5, // Increased retries for Idealista
        maxConcurrency: 1,
        minConcurrency: 1,
        maxRequestsPerMinute: 15, // Reduced to avoid blocks
        
        requestHandler: async ({ request, $, response }) => {
            const { site, criteria, attempt } = request.userData;
            
            console.log(`\n🏠 Processando ${site.name}...`);
            console.log(`📊 Status: ${response.statusCode}`);
            
            // Enhanced delay logic with exponential backoff
            const baseDelay = site.antiBot ? 5000 : 2000;
            const maxDelay = site.antiBot ? 10000 : 5000;
            await randomDelay(baseDelay * attempt, maxDelay * attempt);
            
            if (response.statusCode === 429 || response.statusCode === 403) {
                console.log(`🚫 ${site.name} bloqueou o request (${response.statusCode})`);
                
                if (attempt < 5) {
                    const retryDelay = Math.pow(2, attempt) * 10000; // Exponential backoff
                    console.log(`🔄 Tentando novamente em ${retryDelay/1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    
                    await requestQueue.addRequest({
                        url: request.url,
                        userData: { 
                            ...request.userData, 
                            attempt: attempt + 1 
                        },
                        headers: site.antiBot ? getEnhancedHeaders() : getRandomHeaders()
                        // proxyConfiguration: site.antiBot ? { useApifyProxy: true } : undefined
                    });
                }
                return;
            }
            
            if (response.statusCode !== 200) {
                console.log(`❌ ${site.name} - Status: ${response.statusCode}`);
                return;
            }
            
            console.log(`✅ ${site.name} acessível!`);
            
            const properties = await extractProperties($, site, criteria, request.url);
            
            if (properties.length > 0) {
                console.log(`📊 ${site.name}: ${properties.length} imóveis encontrados`);
                
                const limitedProperties = properties.slice(0, 5);
                
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
                debugPageStructure($, site);
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

function getRandomHeaders() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    ];
    
    return {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
        'Referer': 'https://www.google.pt/'
    };
}

function getEnhancedHeaders() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/122.0.0.0'
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
        'Sec-CH-UA': '"Chromium";v="122", "Not(A:Brand";v="24"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"'
    };
}

function randomDelay(min, max) {
    const delay = Math.random() * (max - min) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

async function extractProperties($, site, criteria, sourceUrl) {
    const properties = [];
    
    let containers = $(site.selectors.container);
    
    if (containers.length === 0) {
        const genericSelectors = [
            'article', '.property', '.listing', '.item', '.card',
            '[class*="property"]', '[class*="imovel"]', '[class*="casa"]',
            '[class*="listing"]', '[data-cy]', '[data-test]'
        ];
        
        for (const selector of genericSelectors) {
            const elements = $(selector);
            if (elements.length >= 3) {
                containers = elements;
                console.log(`✅ Usando selector genérico: ${selector} (${elements.length} elementos)`);
                break;
            }
        }
    }
    
    console.log(`🔍 ${site.name}: ${containers.length} containers encontrados`);
    
    containers.each((i, el) => {
        if (i >= 8) return;
        
        const item = $(el);
        const property = extractSingleProperty(item, site, sourceUrl);
        
        if (property && isPropertyRelevant(property, criteria)) {
            properties.push(property);
        }
    });
    
    return properties
        .sort((a, b) => calculateRelevanceScore(b, criteria) - calculateRelevanceScore(a, criteria))
        .slice(0, 5);
}

function extractSingleProperty(item, site, sourceUrl) {
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
    
    if (Math.random() < 0.1) {
        console.log(`🔍 HTML sample: ${item.html()?.substring(0, 200)}...`);
    }
    
    const titleSelectors = [
        ...site.selectors.title.split(', '),
        'a[title]', 'a', 'h1', 'h2', 'h3', 'h4', 
        '[class*="title"]', '[class*="nome"]', '[class*="link"]'
    ];
    
    for (const selector of titleSelectors) {
        const el = item.find(selector);
        if (el.length > 0) {
            const text = el.attr('title') || el.text().trim();
            const href = el.attr('href') || el.find('a').attr('href');
            
            if (text && text.length > 10 && !text.toLowerCase().includes('javascript')) {
                property.title = text.substring(0, 200);
                if (href && href !== '#' && !href.startsWith('javascript')) {
                    property.link = href.startsWith('http') ? href : site.baseUrl + href;
                }
                break;
            }
        }
    }
    
    if (!property.title) {
        const textElements = item.find('*').filter((i, el) => {
            const text = $(el).text().trim();
            return text.length > 20 && text.length < 150 && 
                   (text.toLowerCase().includes('apartamento') || 
                    text.toLowerCase().includes('moradia') ||
                    text.toLowerCase().includes('t1') ||
                    text.toLowerCase().includes('t2') ||
                    text.toLowerCase().includes('t3') ||
                    text.toLowerCase().includes('t4'));
        });
        
        if (textElements.length > 0) {
            property.title = $(textElements[0]).text().trim().substring(0, 200);
        }
    }
    
    const priceSelectors = [
        ...site.selectors.price.split(', '),
        '[class*="price"]', '[class*="preco"]', '[class*="valor"]', 
        '[class*="euro"]', 'span', 'div'
    ];
    
    for (const selector of priceSelectors) {
        const el = item.find(selector);
        if (el.length > 0) {
            const text = el.text().trim();
            if (text && (text.includes('€') || text.match(/\d{3}\.\d{3}/) || text.match(/\d{6,}/))) {
                property.price = text.substring(0, 50);
                break;
            }
        }
    }
    
    const locationSelectors = [
        ...site.selectors.location.split(', '),
        '[class*="location"]', '[class*="zona"]', '[class*="address"]',
        '[class*="local"]', '[class*="cidade"]', 'address'
    ];
    
    for (const selector of locationSelectors) {
        const el = item.find(selector);
        if (el.length > 0) {
            const text = el.text().trim();
            if (text && text.length > 2 && text.length < 100 && 
                !text.includes('€') && !text.match(/^\d+$/)) {
                property.location = text.substring(0, 100);
                break;
            }
        }
    }
    
    const areaSelectors = [
        ...site.selectors.area.split(', '),
        '[class*="area"]', '[class*="m2"]', '[class*="metros"]'
    ];
    
    for (const selector of areaSelectors) {
        const el = item.find(selector);
        if (el.length > 0) {
            const text = el.text().trim();
            if (text && text.match(/\d+.*m[²2]/i)) {
                property.area = text.substring(0, 20);
                break;
            }
        }
    }
    
    if (!property.area && property.title) {
        const areaMatch = property.title.match(/(\d+)\s*m[²2]/i);
        if (areaMatch) {
            property.area = `${areaMatch[1]}m²`;
        }
    }
    
    const roomsSelectors = [
        ...site.selectors.rooms.split(', '),
        '[class*="quarto"]', '[class*="rooms"]', '[class*="tipologia"]'
    ];
    
    for (const selector of roomsSelectors) {
        const el = item.find(selector);
        if (el.length > 0) {
            const text = el.text().trim();
            if (text && (text.match(/t\d/i) || text.match(/\d.*quarto/i))) {
                property.rooms = text.substring(0, 10);
                break;
            }
        }
    }
    
    if (!property.rooms && property.title) {
        const roomsMatch = property.title.match(/t(\d+)/i);
        if (roomsMatch) {
            property.rooms = `T${roomsMatch[1]}`;
        }
    }
    
    if (property.title && property.title.length > 15 && 
        (property.price || property.location)) {
        return property;
    }
    
    return null;
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
        
        if (propRooms.includes(criteriaRooms) || propTitle.includes(criteriaRooms)) {
            relevantCount++;
        }
    }
    
    if (criteria.area) {
        totalCriteria++;
        const areaMatch = property.area.match(/(\d+)/);
        const titleAreaMatch = property.title.match(/(\d+)\s*m[2²]/i);
        
        if (areaMatch || titleAreaMatch) {
            const propArea = parseInt(areaMatch?.[1] || titleAreaMatch?.[1]);
            if (propArea && Math.abs(propArea - criteria.area) <= 30) {
                relevantCount++;
            }
        }
    }
    
    return totalCriteria === 0 || (relevantCount / totalCriteria) >= 0.4;
}

function calculateRelevanceScore(property, criteria) {
    let score = 0;
    
    if (criteria.location && property.location.toLowerCase().includes(criteria.location)) {
        score += 10;
    }
    
    if (criteria Comet: .rooms && (property.rooms.toLowerCase().includes(criteria.rooms.toLowerCase()) || 
                          property.title.toLowerCase().includes(criteria.rooms.toLowerCase()))) {
        score += 10;
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

function debugPageStructure($, site) {
    console.log(`🔍 Debugging ${site.name}:`);
    
    const classCounts = {};
    $('*[class]').each((i, el) => {
        const classes = $(el).attr('class').split(' ');
        classes.forEach(cls => {
            if (cls.length > 2) {
                classCounts[cls] = (classCounts[cls] || 0) + 1;
            }
        });
    });
    
    const topClasses = Object.entries(classCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
    
    console.log('🏆 Top classes:');
    topClasses.forEach(([cls, count]) => {
        console.log(`  .${cls}: ${count}`);
    });
    
    const propertyKeywords = ['apartamento', 'moradia', 'quarto', 't1', 't2', 't3', 't4', '€', 'metro'];
    const textElements = [];
    
    $('*').each((i, el) => {
        const text = $(el).text().toLowerCase();
        if (propertyKeywords.some(keyword => text.includes(keyword)) && text.length < 200) {
            textElements.push({
                tag: el.tagName,
                class: $(el).attr('class') || '',
                text: text.substring(0, 100)
            });
        }
    });
    
    console.log(`🏠 Elementos com keywords: ${Math.min(5, textElements.length)}`);
    textElements.slice(0, 5).forEach((el, i) => {
        console.log(`  ${i + 1}. <${el.tag} class="${el.class}">: ${el.text}...`);
    });
}

main().catch(console.error);
