const { Actor } = require('apify');
const { RequestQueue, CheerioCrawler, Dataset } = require('crawlee');

const main = async () => {
    await Actor.init();
    
    const input = await Actor.getInput();
    console.log('📥 Input recebido:', input);
    
    // Query exemplo: "Imóvel T4 Cascais 250m2 novo"
    const query = input.query || input.searchQuery || '';
    
    if (!query) {
        console.log('❌ Nenhuma query fornecida');
        await Actor.exit();
        return;
    }
    
    console.log(`🔍 Query: "${query}"`);
    
    // Parse da query em linguagem natural
    const searchCriteria = parseQuery(query);
    console.log('📋 Critérios extraídos:', searchCriteria);
    
    // Sites de imóveis portugueses com configurações específicas
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
        }
    ];
    
    const requestQueue = await RequestQueue.open();
    
    // Adicionar requests para cada site
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
                    headers: getRandomHeaders()
                });
            }
        } catch (error) {
            console.log(`❌ Erro ao construir URL para ${site.name}:`, error.message);
        }
    }
    
    const crawler = new CheerioCrawler({
        requestQueue,
        maxRequestRetries: 3,
        maxConcurrency: 1, // Sequencial para evitar bloqueios
        minConcurrency: 1,
        
        // Delays entre requests
        maxRequestsPerMinute: 20,
        
        requestHandler: async ({ request, $, response }) => {
            const { site, criteria } = request.userData;
            
            console.log(`\n🏠 Processando ${site.name}...`);
            console.log(`📊 Status: ${response.statusCode}`);
            
            // Delays aleatórios para parecer mais humano
            await randomDelay(2000, 5000);
            
            if (response.statusCode === 429 || response.statusCode === 403) {
                console.log(`🚫 ${site.name} bloqueou o request (${response.statusCode})`);
                
                // Tentar novamente com delay maior
                if (request.userData.attempt < 2) {
                    console.log('🔄 Tentando novamente em 30s...');
                    await new Promise(resolve => setTimeout(resolve, 30000));
                    
                    await requestQueue.addRequest({
                        url: request.url,
                        userData: { 
                            ...request.userData, 
                            attempt: request.userData.attempt + 1 
                        },
                        headers: getRandomHeaders()
                    });
                }
                return;
            }
            
            if (response.statusCode !== 200) {
                console.log(`❌ ${site.name} - Status: ${response.statusCode}`);
                return;
            }
            
            console.log(`✅ ${site.name} acessível!`);
            
            // Extrair imóveis
            const properties = await extractProperties($, site, criteria, request.url);
            
            if (properties.length > 0) {
                console.log(`📊 ${site.name}: ${properties.length} imóveis encontrados`);
                
                // Limitar a 5 por site
                const limitedProperties = properties.slice(0, 5);
                
                // Mostrar preview dos primeiros 2
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
                
                // Debug: mostrar estrutura da página
                console.log('🔍 Analisando estrutura da página...');
                debugPageStructure($, site);
            }
        },
        
        failedRequestHandler: async ({ request, error }) => {
            console.log(`❌ Falha em ${request.userData.site.name}: ${error.message}`);
        },
    });
    
    console.log('\n🚀 Iniciando scraping...');
    await crawler.run();
    
    // Resumo final
    const dataset = await Dataset.open();
    const data = await dataset.getData();
    const totalProperties = data.items.length;
    
    console.log(`\n🎉 Scraping concluído!`);
    console.log(`📊 Total de imóveis encontrados: ${totalProperties}`);
    
    // Resumo por site
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

// Função para fazer parse da query em linguagem natural
function parseQuery(query) {
    const criteria = {
        location: '',
        rooms: '',
        area: '',
        condition: '',
        type: 'apartamento' // default
    };
    
    const queryLower = query.toLowerCase();
    
    // Extrair tipologia (T0, T1, T2, T3, T4, T5+)
    const roomsMatch = queryLower.match(/t(\d+)/);
    if (roomsMatch) {
        criteria.rooms = `T${roomsMatch[1]}`;
    }
    
    // Extrair área (números seguidos de m2, metros, etc)
    const areaMatch = queryLower.match(/(\d+)\s*m[2²]?/);
    if (areaMatch) {
        criteria.area = parseInt(areaMatch[1]);
    }
    
    // Extrair localização (cidades portuguesas comuns)
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
    
    // Extrair condição
    const conditions = ['novo', 'renovado', 'para renovar', 'usado', 'recente'];
    for (const cond of conditions) {
        if (queryLower.includes(cond)) {
            criteria.condition = cond;
            break;
        }
    }
    
    // Extrair tipo de imóvel
    if (queryLower.includes('moradia') || queryLower.includes('casa')) {
        criteria.type = 'moradia';
    } else if (queryLower.includes('apartamento') || queryLower.includes('apto')) {
        criteria.type = 'apartamento';
    }
    
    return criteria;
}

// Construir URL do Casa Sapo
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
        // Casa Sapo usa diferentes parâmetros para quartos
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

// Construir URL do Imovirtual
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

// Construir URL do ERA
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

// Headers aleatórios para parecer mais humano
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

// Delay aleatório para parecer humano
function randomDelay(min, max) {
    const delay = Math.random() * (max - min) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

// Extrair propriedades com seletores inteligentes
async function extractProperties($, site, criteria, sourceUrl) {
    const properties = [];
    
    // Encontrar containers
    let containers = $(site.selectors.container);
    
    // Se não encontrar, tentar seletores genéricos
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
        if (i >= 8) return; // Máximo 8 para escolher os melhores 5
        
        const item = $(el);
        const property = extractSingleProperty(item, site, sourceUrl);
        
        if (property && isPropertyRelevant(property, criteria)) {
            properties.push(property);
        }
    });
    
    // Ordenar por relevância e retornar os melhores 5
    return properties
        .sort((a, b) => calculateRelevanceScore(b, criteria) - calculateRelevanceScore(a, criteria))
        .slice(0, 5);
}

// Extrair uma única propriedade
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
    
    // Para debug - mostrar HTML do primeiro item
    if (Math.random() < 0.1) { // 10% chance para não spammar logs
        console.log(`🔍 HTML sample: ${item.html()?.substring(0, 200)}...`);
    }
    
    // Extrair título com seletores mais amplos
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
    
    // Se não encontrou título no link, procurar em qualquer texto
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
    
    // Extrair preço com seletores mais amplos
    const priceSelectors = [
        ...site.selectors.price.split(', '),
        '[class*="price"]', '[class*="preco"]', '[class*="valor"]', 
        '[class*="euro"]', 'span', 'div'
    ];
    
    for (const selector of priceSelectors) {
        const el = item.find(selector);
        if (el.length > 0) {
            const text = el.text().trim();
            // Verificar se contém € ou padrão de preço
            if (text && (text.includes('€') || text.match(/\d{3}\.\d{3}/) || text.match(/\d{6,}/))) {
                property.price = text.substring(0, 50);
                break;
            }
        }
    }
    
    // Extrair localização
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
    
    // Extrair área
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
    
    // Se não encontrou área nos seletores, procurar no texto geral
    if (!property.area && property.title) {
        const areaMatch = property.title.match(/(\d+)\s*m[²2]/i);
        if (areaMatch) {
            property.area = `${areaMatch[1]}m²`;
        }
    }
    
    // Extrair quartos/tipologia
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
    
    // Se não encontrou quartos, procurar no título
    if (!property.rooms && property.title) {
        const roomsMatch = property.title.match(/t(\d+)/i);
        if (roomsMatch) {
            property.rooms = `T${roomsMatch[1]}`;
        }
    }
    
    // Só retornar se tiver pelo menos título e (preço ou localização)
    if (property.title && property.title.length > 15 && 
        (property.price || property.location)) {
        return property;
    }
    
    return null;
}

// Verificar se o imóvel é relevante para os critérios
function isPropertyRelevant(property, criteria) {
    if (!criteria.location && !criteria.rooms && !criteria.area) {
        return true; // Sem critérios específicos
    }
    
    let relevantCount = 0;
    let totalCriteria = 0;
    
    // Verificar localização
    if (criteria.location) {
        totalCriteria++;
        const propLocation = property.location.toLowerCase();
        const propTitle = property.title.toLowerCase();
        
        if (propLocation.includes(criteria.location) || propTitle.includes(criteria.location)) {
            relevantCount++;
        }
    }
    
    // Verificar tipologia
    if (criteria.rooms) {
        totalCriteria++;
        const propRooms = property.rooms.toLowerCase();
        const propTitle = property.title.toLowerCase();
        const criteriaRooms = criteria.rooms.toLowerCase();
        
        if (propRooms.includes(criteriaRooms) || propTitle.includes(criteriaRooms)) {
            relevantCount++;
        }
    }
    
    // Verificar área (com margem de ±30m²)
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
    
    // Considerar relevante se atender pelo menos 50% dos critérios
    return totalCriteria === 0 || (relevantCount / totalCriteria) >= 0.4;
}

// Calcular score de relevância
function calculateRelevanceScore(property, criteria) {
    let score = 0;
    
    // Pontos por correspondência exata
    if (criteria.location && property.location.toLowerCase().includes(criteria.location)) {
        score += 10;
    }
    
    if (criteria.rooms && (property.rooms.toLowerCase().includes(criteria.rooms.toLowerCase()) || 
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
    
    // Pontos por qualidade dos dados
    if (property.price && property.price !== 'N/A') score += 3;
    if (property.location && property.location !== 'N/A') score += 3;
    if (property.area && property.area !== 'N/A') score += 2;
    if (property.rooms && property.rooms !== 'N/A') score += 2;
    if (property.link) score += 2;
    
    return score;
}

// Debug da estrutura da página
function debugPageStructure($, site) {
    console.log(`🔍 Debugging ${site.name}:`);
    
    // Contar elementos por classe
    const classCounts = {};
    $('*[class]').each((i, el) => {
        const classes = $(el).attr('class').split(' ');
        classes.forEach(cls => {
            if (cls.length > 2) {
                classCounts[cls] = (classCounts[cls] || 0) + 1;
            }
        });
    });
    
    // Mostrar top 10 classes
    const topClasses = Object.entries(classCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
    
    console.log('🏆 Top classes:');
    topClasses.forEach(([cls, count]) => {
        console.log(`  .${cls}: ${count}`);
    });
    
    // Procurar por texto relacionado com imóveis
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
