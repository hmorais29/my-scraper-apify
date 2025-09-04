import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';
import locations from './locations.json' with { type: 'json' };

await Actor.init();

const input = await Actor.getInput();
const query = input?.query || 'T3 santo antonio dos cavaleiros';
const maxResults = input?.max_resultados || 5;

console.log('🔍 Query:', query);

// Detectar se é arrendamento ou compra/venda
function detectSearchType(query) {
    const rentKeywords = /arrendamento|arrendar|alugar|rent|rental/i;
    const isRent = rentKeywords.test(query);
    
    console.log(`🎯 Tipo detectado: ${isRent ? 'ARRENDAMENTO' : 'COMPRA/VENDA'}`);
    return isRent ? 'rent' : 'buy';
}

// Detectar estado do imóvel
function detectPropertyCondition(query) {
    const newKeywords = /novo|novos|nova|novas|construção nova|obra nova/i;
    const usedKeywords = /usado|usados|usada|usadas|segunda mão/i;
    const renovatedKeywords = /renovado|renovados|renovada|renovadas|remodelado|restaurado/i;
    
    if (newKeywords.test(query)) {
        console.log('🏗️ Estado detectado: NOVO');
        return 'new';
    } else if (renovatedKeywords.test(query)) {
        console.log('🔨 Estado detectado: RENOVADO');
        return 'renovated';
    } else if (usedKeywords.test(query)) {
        console.log('🏠 Estado detectado: USADO');
        return 'used';
    }
    
    console.log('❓ Estado não especificado');
    return null;
}

// Extrair apenas o essencial
function extractBasics(query) {
    const locationPatterns = [
        /santo ant[oô]nio dos cavaleiros/i,
        /caldas da rainha/i,
        /vila nova de gaia/i,
        /santa maria da feira/i,
        /s[aã]o jo[aã]o da madeira/i,
        /lisboa|porto|coimbra|braga|loures|sintra|cascais|almada|amadora|setúbal|aveiro/i
    ];
    
    let location = '';
    for (const pattern of locationPatterns) {
        const match = query.match(pattern);
        if (match) {
            location = match[0].toLowerCase();
            break;
        }
    }
    
    const rooms = query.match(/T(\d)/i)?.[0]?.toUpperCase() || '';
    const searchType = detectSearchType(query);
    const condition = detectPropertyCondition(query);
    
    console.log(`📍 Localização extraída: "${location}"`);
    console.log(`🏠 Tipologia: ${rooms}`);
    console.log(`🏗️ Estado: ${condition || 'não especificado'}`);
    
    return { location, rooms, searchType, condition };
}

// Função para extrair tipologia do texto - CORRIGIDA
function extractRoomsFromText(text) {
    let cleanText = text.replace(/\.css-[a-zA-Z0-9_-]+[\{\[]/g, ' ');
    cleanText = cleanText.replace(/\d+\s*\/\s*\d+/g, ' ');
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    // Padrões mais específicos
    const patterns = [
        /T(\d+)/i,
        /(\d+)\s+quartos/i,
        /apartamento.*?(\d+)\s*assoalhadas/i
    ];
    
    for (const pattern of patterns) {
        const match = cleanText.match(pattern);
        if (match && match[1]) {
            const rooms = `T${match[1]}`;
            console.log('🏠 Tipologia encontrada:', rooms);
            return rooms;
        }
    }
    
    return '';
}

// Função para extrair área - CORRIGIDA  
function extractAreaFromText(text) {
    let cleanText = text.replace(/\.css-[a-zA-Z0-9_-]+[\{\[]/g, ' ');
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    const areaPatterns = [
        /(\d+(?:[,\.]\d+)?)\s*m[²2]/i,
        /(\d+)\s*m²/i
    ];
    
    for (const pattern of areaPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
            let area = parseFloat(match[1].replace(',', '.'));
            if (area > 20 && area < 1000) {
                console.log(`📐 Área: ${Math.round(area)}m²`);
                return Math.round(area);
            }
        }
    }
    
    return 0;
}

// Função para extrair preço - CORRIGIDA
function extractPriceFromText(text, searchType) {
    let cleanText = text.replace(/\.css-[a-zA-Z0-9_-]+[\{\[]/g, ' ');
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    console.log('💰 Texto para preço:', cleanText.substring(0, 100));
    
    // Padrões corrigidos baseados nos dados reais do diagnóstico
    const pricePatterns = [
        // Formato observado: "250 000 €" ou "480 000 €" 
        /(\d{1,3}(?:\s+\d{3})+)\s*€/g,
        // Formato com pontos: "250.000 €"
        /(\d{1,3}(?:\.\d{3})+)\s*€/g,
        // Para arrendamento: números menores
        searchType === 'rent' ? /(\d{3,4})\s*€/g : null
    ].filter(Boolean);
    
    let prices = [];
    
    for (const pattern of pricePatterns) {
        let match;
        pattern.lastIndex = 0;
        
        while ((match = pattern.exec(cleanText)) !== null) {
            let priceStr = match[1].replace(/\s+/g, '').replace(/\./g, '');
            let price = parseInt(priceStr);
            
            let isValid;
            if (searchType === 'rent') {
                isValid = price >= 200 && price <= 5000;
            } else {
                isValid = price >= 50000 && price <= 5000000;
            }
            
            if (isValid) {
                prices.push(price);
                console.log(`✅ Preço válido: ${price.toLocaleString()}€`);
            }
        }
    }
    
    if (prices.length > 0) {
        const finalPrice = searchType === 'rent' ? Math.min(...prices) : Math.max(...prices);
        return finalPrice;
    }
    
    return 0;
}

// Função de localização (mantém a mesma lógica)
function findSlugFromLocation(locationQuery) {
    console.log(`🔍 A procurar localização: "${locationQuery}"`);
    
    let allLocationArrays = {};
    
    if (locations.districts && locations.councils && locations.parishes && locations.neighborhoods) {
        allLocationArrays = locations;
    } else if (Array.isArray(locations) && locations.length > 0) {
        const consolidatedData = locations.find(item => item.type === 'FINAL_CONSOLIDATED_DATA');
        if (consolidatedData) {
            allLocationArrays = consolidatedData;
        } else {
            return null;
        }
    } else {
        return null;
    }

    const normalized = locationQuery.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const allLocations = [
        ...allLocationArrays.neighborhoods.map(n => ({...n, priority: 4})),
        ...allLocationArrays.parishes.map(p => ({...p, priority: 3})),
        ...allLocationArrays.councils.map(c => ({...c, priority: 2})),
        ...allLocationArrays.districts.map(d => ({...d, priority: 1}))
    ];

    let bestMatch = null;
    let bestScore = 0;

    for (const location of allLocations) {
        const locationName = location.name.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        let score = 0;
        
        if (normalized.includes(locationName) || locationName.includes(normalized)) {
            score = locationName.length * location.priority * 10;
            
            if (locationName === normalized) {
                score *= 2;
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = location;
            }
        }
    }

    if (bestMatch) {
        console.log(`✅ Localização encontrada: ${bestMatch.name} (${bestMatch.level})`);
        return bestMatch;
    }
    
    return null;
}

// Função de URL (mantém a mesma lógica)
function buildURL(locationQuery, rooms, searchType, condition) {
    let baseUrl = 'https://www.imovirtual.com/pt/resultados/';
    baseUrl += searchType === 'rent' ? 'arrendar/apartamento' : 'comprar/apartamento';
    
    if (rooms) {
        const roomNum = rooms.replace('T', '').toLowerCase();
        baseUrl += `,t${roomNum}`;
    }

    const match = findSlugFromLocation(locationQuery);
    if (match) {
        baseUrl += `/${match.id}`;
    }

    const params = new URLSearchParams();
    params.set('limit', '36');
    params.set('ownerTypeSingleSelect', 'ALL');
    params.set('by', 'DEFAULT');
    params.set('direction', 'DESC');

    if (condition) {
        switch (condition) {
            case 'new':
                params.set('search[filter_enum_builttype]', '0');
                break;
            case 'used':
                params.set('search[filter_enum_builttype]', '1');
                break;
            case 'renovated':
                params.set('search[filter_enum_builttype]', '2');
                break;
        }
    }

    return baseUrl + '?' + params.toString();
}

const { location, rooms: searchRooms, searchType, condition } = extractBasics(query);
const searchUrl = buildURL(location, searchRooms, searchType, condition);

console.log('🌐 URL final:', searchUrl);

const results = [];

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 3,
    requestHandlerTimeoutSecs: 30,
    
    async requestHandler({ $, response, request }) {
        if (response.statusCode !== 200) {
            console.log(`❌ Erro HTTP: ${response.statusCode}`);
            return;
        }
        
        console.log('✅ Página carregada com sucesso');
        
        // SELETOR CORRETO baseado no diagnóstico
        const correctSelector = '[data-cy="search.listing.organic"] article';
        const listings = $(correctSelector);
        
        console.log(`📊 ${listings.length} anúncios encontrados com seletor correto`);
        
        if (listings.length === 0) {
            console.log('❌ Nenhum anúncio encontrado');
            return;
        }
        
        let count = 0;
        const listingArray = listings.toArray().slice(0, maxResults * 2);
        
        for (let i = 0; i < listingArray.length && count < maxResults; i++) {
            try {
                const el = listingArray[i];
                const $el = $(el);
                const rawText = $el.text();
                
                console.log(`\n--- ANÚNCIO ${i + 1} ---`);
                
                // EXTRAIR LINK - seletores baseados no diagnóstico
                const linkSelectors = [
                    '[data-cy="listing-item-link"]',
                    'a[href*="/anuncio/"]',
                    'a[href*="ID"]',
                    'a[href]'
                ];
                
                let link = '';
                for (const linkSel of linkSelectors) {
                    const linkEl = $el.find(linkSel).first();
                    link = linkEl.attr('href') || '';
                    if (link && (link.includes('anuncio') || link.includes('ID'))) {
                        if (!link.startsWith('http')) {
                            link = 'https://www.imovirtual.com' + link;
                        }
                        console.log(`🔗 Link: ${link.substring(0, 60)}...`);
                        break;
                    }
                }
                
                // EXTRAIR TÍTULO
                const titleSelectors = [
                    '[data-cy="listing-item-title"]',
                    'h2', 'h3', 'p'
                ];
                
                let title = '';
                for (const sel of titleSelectors) {
                    const titleEl = $el.find(sel).first();
                    title = titleEl.text().trim();
                    if (title && title.length > 10 && !title.includes('css-')) {
                        console.log(`📋 Título: ${title.substring(0, 50)}...`);
                        break;
                    }
                }
                
                if (!title || title.length < 10) {
                    title = 'Apartamento para ' + (searchType === 'rent' ? 'arrendamento' : 'venda');
                }
                
                // EXTRAIR DADOS usando as funções corrigidas
                const price = extractPriceFromText(rawText, searchType);
                const actualRooms = extractRoomsFromText(rawText) || searchRooms;
                const area = extractAreaFromText(rawText);
                
                console.log(`💰 Preço: ${price.toLocaleString()}€`);
                console.log(`🏠 Tipologia: ${actualRooms}`);
                console.log(`📐 Área: ${area}m²`);
                
                // VALIDAÇÕES
                const hasValidPrice = price > 0;
                const hasTitle = title && title.length > 10;
                const hasLink = link && link.includes('imovirtual');
                
                let priceInRange;
                if (searchType === 'rent') {
                    priceInRange = price >= 200 && price <= 5000;
                } else {
                    priceInRange = price >= 25000 && price <= 3000000;
                }
                
                const isValid = hasValidPrice && hasTitle && hasLink && priceInRange;
                
                if (isValid) {
                    const property = {
                        title: title.substring(0, 200),
                        price: price,
                        area: area,
                        rooms: actualRooms,
                        location: location,
                        pricePerSqm: area > 0 ? Math.round(price / area) : 0,
                        link: link,
                        site: 'ImóVirtual',
                        searchQuery: query,
                        searchType: searchType,
                        condition: condition,
                        propertyIndex: count + 1,
                        priceFormatted: `${price.toLocaleString()} €`,
                        areaFormatted: `${area} m²`,
                        pricePerSqmFormatted: area > 0 ? `${Math.round(price / area).toLocaleString()} €/m²` : 'N/A',
                        timestamp: new Date().toISOString(),
                        searchUrl: request.loadedUrl
                    };
                    
                    results.push(property);
                    count++;
                    
                    console.log(`✅ ${count}. ADICIONADO: ${actualRooms} - ${area}m² - ${price.toLocaleString()}€`);
                } else {
                    console.log(`❌ REJEITADO:`);
                    console.log(`   - Preço válido: ${hasValidPrice} (${price})`);
                    console.log(`   - Título válido: ${hasTitle}`);
                    console.log(`   - Link válido: ${hasLink}`);
                    console.log(`   - Preço em range: ${priceInRange}`);
                }
                
            } catch (error) {
                console.log(`⚠️ Erro no anúncio ${i + 1}:`, error.message);
            }
        }
        
        console.log(`\n🎉 RESULTADO: ${count} de ${listingArray.length} anúncios válidos encontrados`);
    },
    
    failedRequestHandler({ request, error }) {
        console.log(`❌ Falha na requisição ${request.url}: ${error.message}`);
    }
});

try {
    await crawler.run([searchUrl]);
    
    if (results.length === 0) {
        console.log('⚠️ Nenhum resultado encontrado. A tentar URL mais genérica...');
        const fallbackUrl = buildURL('', searchRooms, searchType, condition);
        await crawler.run([fallbackUrl]);
    }
    
    await Actor.pushData(results);
    console.log(`✅ Scraping concluído: ${results.length} resultados válidos salvos`);
    
} catch (error) {
    console.log('❌ Erro no scraping:', error.message);
    await Actor.pushData(results);
    
} finally {
    await Actor.exit();
}
