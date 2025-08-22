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
    
    // ... [funções buildUrl permanecem iguais] ...
    function buildImovirtualUrl(criteria) {
        let url = 'https://www.imovirtual.com/comprar';
        
        if (criteria.type === 'apartamento') {
            url += '/apartamento';
        } else if (criteria.type === 'moradia') {
            url += '/moradia';
        }
        
        if (criteria.location) {
            const locationSlug = criteria.location.toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/ã/g, 'a')
                .replace(/õ/g, 'o')
                .replace(/á/g, 'a')
                .replace(/é/g, 'e')
                .replace(/í/g, 'i')
                .replace(/ó/g, 'o')
                .replace(/ú/g, 'u')
                .replace(/ç/g, 'c');
            url += `/${locationSlug}`;
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
            const locationSlug = criteria.location.toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/ã/g, 'a')
                .replace(/õ/g, 'o')
                .replace(/á/g, 'a')
                .replace(/é/g, 'e')
                .replace(/í/g, 'i')
                .replace(/ó/g, 'o')
                .replace(/ú/g, 'u')
                .replace(/ç/g, 'c');
            url += `/${locationSlug}`;
        }
        
        return url;
    }

    const propertySites = [
        {
            name: 'Imovirtual',
            baseUrl: 'https://www.imovirtual.com',
            buildSearchUrl: buildImovirtualUrl,
            // SELETORES MAIS ESPECÍFICOS PARA IMOVIRTUAL
            selectors: {
                container: 'article[data-cy="search.listing.organic"]',
                title: 'h3[data-cy="search.listing.title"] span',
                price: 'span[data-cy="search.listing.price"]',
                location: 'span[data-cy="search.listing.location"]',
                area: 'div[data-cy="search.listing.characteristics"] span:contains("m²")',
                rooms: 'div[data-cy="search.listing.characteristics"] span:contains("quarto")',
                link: 'a[data-cy="search.listing.link"]'
            }
        },
        {
            name: 'ERA Portugal',
            baseUrl: 'https://www.era.pt',
            buildSearchUrl: buildEraUrl,
            selectors: {
                container: 'div[class*="property"], div[class*="listing"], div[class*="imovel"], div[class*="resultado"], .property-card, .property-item',
                title: 'a[href*="/imovel/"], a[href*="/propriedade/"], h3 a, h2 a, .property-title a',
                price: '*[class*="price"], *[class*="valor"], span:contains("€"), div:contains("€")',
                location: '*[class*="location"], *[class*="address"], *[class*="local"], span[class*="place"]',
                area: '*[class*="area"], *[class*="surface"], *:contains("m²"), *:contains("m2")',
                rooms: '*[class*="room"], *[class*="quarto"], *[class*="tipologia"], *:contains("T1"), *:contains("T2"), *:contains("T3"), *:contains("T4")'
            }
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
                    userData: { site, criteria: searchCriteria },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1'
                    }
                });
            }
        } catch (error) {
            console.log(`❌ Erro ao construir URL para ${site.name}:`, error.message);
        }
    }
    
    const crawler = new CheerioCrawler({
        requestQueue,
        maxRequestRetries: 2,
        maxConcurrency: 1,
        maxRequestsPerMinute: 1,
        requestHandlerTimeoutSecs: 60,
        requestHandler: async ({ request, $, response }) => {
            const { site, criteria } = request.userData;
            
            console.log(`\n🏠 Processando ${site.name}...`);
            console.log(`📊 Status: ${response.statusCode}`);
            
            if (response.statusCode !== 200) {
                console.log(`❌ ${site.name} - Status: ${response.statusCode}`);
                return;
            }
            
            console.log(`✅ ${site.name} acessível!`);
            console.log(`📄 Tamanho da página: ${$.html().length} caracteres`);
            
            const properties = [];
            
            if (site.name === 'Imovirtual') {
                properties.push(...extractImovirtualProperties($, site, criteria));
            } else {
                properties.push(...extractGenericProperties($, site, criteria));
            }
            
            const validProperties = properties.filter(prop => validateProperty(prop));
            const relevantProperties = validProperties.filter(prop => isPropertyRelevant(prop, criteria));
            
            console.log(`📊 ${site.name}: ${properties.length} extraídos → ${validProperties.length} válidos → ${relevantProperties.length} relevantes`);
            
            if (relevantProperties.length > 0) {
                await Dataset.pushData(relevantProperties.slice(0, 8));
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

// NOVA FUNÇÃO: Extração específica para ImóVirtual
function extractImovirtualProperties($, site, criteria) {
    const properties = [];
    
    // Tentar primeiro os seletores específicos data-cy
    let containers = $('article[data-cy="search.listing.organic"]');
    
    // Fallback para seletores genéricos
    if (containers.length === 0) {
        console.log('🔍 Tentando seletores genéricos para ImóVirtual...');
        containers = $('article, div[class*="offer"], div[class*="listing-item"]');
    }
    
    console.log(`🔍 Imovirtual: ${containers.length} containers encontrados`);
    
    containers.each((i, el) => {
        if (i >= 15) return; // Limitar resultados
        
        const $el = $(el);
        const property = extractImovirtualProperty($el, site);
        
        if (i < 3) {
            debugProperty(property, i + 1);
        }
        
        if (property.title && property.title.length > 10) {
            properties.push(property);
        }
    });
    
    return properties;
}

// NOVA FUNÇÃO: Extração individual do imóvel ImóVirtual
function extractImovirtualProperty($el, site) {
    const property = {
        title: '',
        price: '',
        location: '',
        area: '',
        rooms: '',
        link: '',
        source: site.name,
        scrapedAt: new Date().toISOString()
    };
    
    // 1. TÍTULO - Abordagem hierárquica
    property.title = extractTitle($el, site);
    
    // 2. LINK - Procurar link principal
    property.link = extractLink($el, site);
    
    // 3. PREÇO - Seletores específicos
    property.price = extractPrice($el);
    
    // 4. LOCALIZAÇÃO - Múltiplas estratégias
    property.location = extractLocation($el);
    
    // 5. ÁREA - Validação rigorosa
    property.area = extractArea($el);
    
    // 6. QUARTOS - Padrões específicos
    property.rooms = extractRooms($el);
    
    return property;
}

// FUNÇÕES DE EXTRAÇÃO ESPECÍFICAS

function extractTitle($el, site) {
    // Estratégia 1: Seletores data-cy específicos
    let title = $el.find('h3[data-cy="search.listing.title"] span').first().text().trim();
    
    // Estratégia 2: Seletores h3/h2 genéricos
    if (!title) {
        title = $el.find('h3 a, h2 a, h3, h2').first().text().trim();
    }
    
    // Estratégia 3: Atributos title/aria-label
    if (!title) {
        const $link = $el.find('a[title], a[aria-label]').first();
        title = $link.attr('title') || $link.attr('aria-label') || '';
    }
    
    // Estratégia 4: Extrair do URL
    if (!title || title.length < 10) {
        const $mainLink = $el.find('a[href*="/anuncio/"]').first();
        const href = $mainLink.attr('href');
        if (href) {
            const urlMatch = href.match(/\/([^\/]+)-ID\w+/);
            if (urlMatch) {
                title = urlMatch[1]
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
            }
        }
    }
    
    // Validação final
    return isValidTitle(title) ? title : '';
}

function extractLink($el, site) {
    const $link = $el.find('a[data-cy="search.listing.link"], a[href*="/anuncio/"]').first();
    const href = $link.attr('href');
    
    if (!href || href === '#') return '';
    
    return href.startsWith('http') ? href : site.baseUrl + href;
}

function extractPrice($el) {
    // Estratégia 1: Seletor específico
    let price = $el.find('span[data-cy="search.listing.price"]').text().trim();
    
    // Estratégia 2: Procurar por padrão de preço
    if (!price) {
        const allText = $el.text();
        const priceMatch = allText.match(/(\d{1,3}(?:[\.\s]\d{3})*(?:,\d{2})?\s*€)/);
        price = priceMatch ? priceMatch[1] : '';
    }
    
    return price;
}

function extractLocation($el) {
    // Estratégia 1: Seletor específico
    let location = $el.find('span[data-cy="search.listing.location"]').text().trim();
    
    // Estratégia 2: Elementos com classes relacionadas
    if (!location) {
        location = $el.find('*[class*="location"], *[class*="address"]').text().trim();
    }
    
    // Estratégia 3: Procurar cidades conhecidas no texto
    if (!location) {
        const allText = $el.text().toLowerCase();
        const cities = ['caldas da rainha', 'lisboa', 'porto', 'cascais', 'sintra', 'coimbra'];
        for (const city of cities) {
            if (allText.includes(city)) {
                location = city;
                break;
            }
        }
    }
    
    return location.toLowerCase();
}

function extractArea($el) {
    // Estratégia 1: Seletor específico para características
    let area = '';
    
    $el.find('div[data-cy="search.listing.characteristics"] span').each((i, span) => {
        const text = $(span).text().trim();
        // Procurar padrão mais específico: número seguido de m²
        const match = text.match(/^(\d{1,4}(?:[,.]\d+)?)\s*m[²2]$/i);
        if (match && !area) {
            const areaNum = parseInt(match[1].replace(',', '.'));
            // Validar se a área faz sentido (5-1000m²)
            if (areaNum >= 5 && areaNum <= 1000) {
                area = match[0];
            }
        }
    });
    
    // Estratégia 2: Procurar em todo o elemento
    if (!area) {
        const allText = $el.text();
        const matches = allText.match(/(\d{1,4}(?:[,.]\d+)?)\s*m[²2]/gi);
        if (matches) {
            // Pegar a área que faz mais sentido (maior que 15m²)
            for (const match of matches) {
                const areaNum = parseInt(match.replace(/[^\d]/g, ''));
                if (areaNum >= 15 && areaNum <= 1000) {
                    area = match;
                    break;
                }
            }
        }
    }
    
    return area;
}

function extractRooms($el) {
    // Estratégia 1: Procurar em características
    let rooms = '';
    
    $el.find('div[data-cy="search.listing.characteristics"] span').each((i, span) => {
        const text = $(span).text().trim();
        
        // Padrão 1: "N quarto(s)"
        const roomMatch = text.match(/(\d+)\s*quarto[s]?/i);
        if (roomMatch && !rooms) {
            rooms = `T${roomMatch[1]}`;
            return;
        }
        
        // Padrão 2: "TN"
        const tMatch = text.match(/^T(\d+)$/i);
        if (tMatch && !rooms) {
            rooms = tMatch[0].toUpperCase();
            return;
        }
    });
    
    // Estratégia 2: Procurar no título
    if (!rooms) {
        const titleText = $el.find('h3, h2').text();
        const tMatch = titleText.match(/T(\d+)/i);
        if (tMatch) {
            rooms = tMatch[0].toUpperCase();
        }
    }
    
    // Estratégia 3: Procurar em todo o elemento
    if (!rooms) {
        const allText = $el.text();
        const tMatch = allText.match(/T([0-6])/i);
        if (tMatch) {
            rooms = tMatch[0].toUpperCase();
        }
    }
    
    return rooms;
}

// FUNÇÃO DE EXTRAÇÃO GENÉRICA (para outros sites)
function extractGenericProperties($, site, criteria) {
    const properties = [];
    
    const containerSelectors = site.selectors.container.split(', ');
    let containers = $();
    
    for (const selector of containerSelectors) {
        const found = $(selector.trim());
        if (found.length > 0) {
            containers = found;
            break;
        }
    }
    
    console.log(`🔍 ${site.name}: ${containers.length} containers encontrados`);
    
    containers.each((i, el) => {
        if (i >= 10) return;
        
        const $el = $(el);
        const property = {
            title: $el.find(site.selectors.title).first().text().trim(),
            price: extractGenericPrice($el),
            location: $el.find(site.selectors.location).first().text().trim().toLowerCase(),
            area: extractGenericArea($el),
            rooms: extractGenericRooms($el),
            link: extractGenericLink($el, site),
            source: site.name,
            scrapedAt: new Date().toISOString()
        };
        
        if (property.title && property.title.length > 10) {
            properties.push(property);
        }
    });
    
    return properties;
}

// FUNÇÕES DE EXTRAÇÃO GENÉRICAS
function extractGenericPrice($el) {
    const allText = $el.text();
    const priceMatch = allText.match(/(\d{1,3}(?:[\.\s]\d{3})*(?:,\d{2})?\s*€)/);
    return priceMatch ? priceMatch[1] : '';
}

function extractGenericArea($el) {
    const allText = $el.text();
    const matches = allText.match(/(\d{1,4}(?:[,.]\d+)?)\s*m[²2]/gi);
    if (matches) {
        for (const match of matches) {
            const areaNum = parseInt(match.replace(/[^\d]/g, ''));
            if (areaNum >= 15 && areaNum <= 1000) {
                return match;
            }
        }
    }
    return '';
}

function extractGenericRooms($el) {
    const allText = $el.text();
    const tMatch = allText.match(/T([0-6])/i);
    return tMatch ? tMatch[0].toUpperCase() : '';
}

function extractGenericLink($el, site) {
    const $link = $el.find('a').first();
    const href = $link.attr('href');
    if (!href || href === '#') return '';
    return href.startsWith('http') ? href : site.baseUrl + href;
}

// FUNÇÕES DE VALIDAÇÃO

function isValidTitle(title) {
    return title && 
           title.length > 10 && 
           !title.includes('css-') &&
           !title.includes('{') &&
           !title.includes('width:') &&
           !title.includes('height:') &&
           !title.includes('aspect-ratio:');
}

function validateProperty(property) {
    // Validações básicas
    if (!property.title || property.title.length < 10) return false;
    if (!isValidTitle(property.title)) return false;
    
    // Pelo menos um dos campos importantes deve estar preenchido
    const hasPrice = property.price && property.price.includes('€');
    const hasLink = property.link && property.link.length > 10;
    const hasArea = property.area && property.area.includes('m');
    const hasRooms = property.rooms && property.rooms.match(/^T[0-6]$/);
    
    return hasPrice || hasLink || (hasArea && hasRooms);
}

function isPropertyRelevant(property, criteria) {
    if (!criteria.location && !criteria.rooms && !criteria.area) {
        return true;
    }
    
    let matches = 0;
    let totalCriteria = 0;
    
    // Verificar localização - MAIS RESTRITIVO
    if (criteria.location) {
        totalCriteria++;
        const normalizedLocation = normalizeText(criteria.location);
        const propLocation = normalizeText(property.location);
        const propTitle = normalizeText(property.title);
        
        if (propLocation.includes(normalizedLocation) || propTitle.includes(normalizedLocation)) {
            matches++;
        }
    }
    
    // Verificar quartos - EXATO
    if (criteria.rooms) {
        totalCriteria++;
        if (property.rooms === criteria.rooms) {
            matches++;
        }
    }
    
    // Verificar área - RANGE MAIS RESTRITO
    if (criteria.area) {
        totalCriteria++;
        const areaMatch = property.area.match(/(\d+)/);
        if (areaMatch) {
            const propArea = parseInt(areaMatch[1]);
            // Range mais restrito: ±15m²
            if (Math.abs(propArea - criteria.area) <= 15) {
                matches++;
            }
        }
    }
    
    // MAIS RESTRITIVO: Precisa de pelo menos 80% de matches
    return totalCriteria === 0 || (matches / totalCriteria) >= 0.8;
}

// FUNÇÕES AUXILIARES

function normalizeText(text) {
    return text.toLowerCase()
        .replace(/[áàãâ]/g, 'a')
        .replace(/[éê]/g, 'e')
        .replace(/[íî]/g, 'i')
        .replace(/[óôõ]/g, 'o')
        .replace(/[úü]/g, 'u')
        .replace(/ç/g, 'c');
}

function debugProperty(property, index) {
    console.log(`🏘️ Debug imóvel ${index}:`);
    console.log(`   📝 Título: "${property.title}"`);
    console.log(`   💰 Preço: "${property.price}"`);
    console.log(`   📍 Local: "${property.location}"`);
    console.log(`   📐 Área: "${property.area}"`);
    console.log(`   🏠 Quartos: "${property.rooms}"`);
    console.log(`   🔗 Link: "${property.link}"`);
}

// FUNÇÃO parseQuery permanece igual
function parseQuery(query) {
    const criteria = {
        location: '',
        rooms: '',
        area: '',
        condition: '',
        type: 'apartamento'
    };
    
    const queryLower = query.toLowerCase()
        .replace(/ã/g, 'a')
        .replace(/õ/g, 'o')
        .replace(/á/g, 'a')
        .replace(/é/g, 'e')
        .replace(/í/g, 'i')
        .replace(/ó/g, 'o')
        .replace(/ú/g, 'u')
        .replace(/ç/g, 'c');
    
    // Extrair tipologia
    const roomsMatch = queryLower.match(/t(\d+)/);
    if (roomsMatch) {
        criteria.rooms = `T${roomsMatch[1]}`;
    }
    
    // Extrair área
    const areaMatch = queryLower.match(/(\d+)\s*m[2²]?/);
    if (areaMatch) {
        criteria.area = parseInt(areaMatch[1]);
    }
    
    // Lista de localizações
    const locations = [
        'lisboa', 'porto', 'braga', 'coimbra', 'aveiro', 'setubal', 'evora', 'faro',
        'funchal', 'viseu', 'leiria', 'santarem', 'beja', 'castelo branco',
        'guarda', 'portalegre', 'vila real', 'braganca', 'viana do castelo',
        'cascais', 'sintra', 'almada', 'amadora', 'oeiras', 'loures', 'odivelas',
        'vila nova de gaia', 'matosinhos', 'gondomar', 'maia', 'povoa de varzim',
        'caldas da rainha', 'torres vedras', 'sesimbra', 'palmela', 'montijo',
        'barreiro', 'vila franca de xira', 'mafra', 'alcochete', 'sines',
        'lagos', 'portimao', 'tavira', 'olhao', 'silves', 'monchique'
    ];
    
    // Procurar localização na query
    for (const loc of locations) {
        if (queryLower.includes(loc)) {
            criteria.location = loc;
            break;
        }
    }
    
    // Extrair condição
    const conditions = ['novo', 'renovado', 'para renovar', 'usado', 'recente', 'seminovo'];
    for (const cond of conditions) {
        if (queryLower.includes(cond)) {
            criteria.condition = cond;
            break;
        }
    }
    
    // Extrair tipo de imóvel
    if (queryLower.includes('moradia') || queryLower.includes('casa') || queryLower.includes('vivenda')) {
        criteria.type = 'moradia';
    } else if (queryLower.includes('apartamento') || queryLower.includes('apto') || queryLower.includes('t0') || queryLower.includes('t1') || queryLower.includes('t2') || queryLower.includes('t3') || queryLower.includes('t4') || queryLower.includes('t5')) {
        criteria.type = 'apartamento';
    }
    
    return criteria;
}

main().catch(console.error);
