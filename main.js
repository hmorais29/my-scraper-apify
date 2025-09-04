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
    // Melhor detecção de localização - procurar por nomes mais específicos primeiro
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

// Função para extrair tipologia do texto (melhorada)
function extractRoomsFromText(text) {
    // Limpar CSS primeiro - regex mais específico
    let cleanText = text.replace(/\.css-[a-zA-Z0-9_-]+[\{\[]/g, ' ');
    cleanText = cleanText.replace(/\d+\s*\/\s*\d+/g, ' '); // Remove frações como "1/25"
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    console.log('🔍 Texto limpo para tipologia:', cleanText.substring(0, 100));
    
    // Procurar padrões mais específicos primeiro
    const specificPatterns = [
        /apartamento\s+T(\d+)/i,
        /tipologia\s*:?\s*T(\d+)/i,
        /T(\d+)\s+(?:apartamento|ap\.)/i,
        /(\d+)\s+quartos/i,
        /(\d+)\s+bedroom/i
    ];
    
    for (const pattern of specificPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
            const rooms = match[1] ? `T${match[1]}` : '';
            if (rooms) {
                console.log('🎯 Tipologia específica encontrada:', rooms);
                return rooms;
            }
        }
    }
    
    // Fallback para padrão simples T1, T2, etc.
    const simpleMatch = cleanText.match(/T(\d+)/i);
    if (simpleMatch) {
        const rooms = simpleMatch[0].toUpperCase();
        console.log('🏠 Tipologia simples encontrada:', rooms);
        return rooms;
    }
    
    console.log('❌ Nenhuma tipologia encontrada no texto');
    return '';
}

// Função para extrair área do texto (melhorada)
function extractAreaFromText(text) {
    // Limpar o texto de CSS e elementos desnecessários
    let cleanText = text.replace(/\.css-[a-zA-Z0-9_-]+[\{\[]/g, ' ');
    cleanText = cleanText.replace(/\d+\s*\/\s*\d+/g, ' '); // Remove frações
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    const areaPatterns = [
        /(\d+(?:[,\.]\d+)?)\s*m[²2]/i,        // 108,28 m² ou 108.28 m²
        /área\s*:?\s*(\d+(?:[,\.]\d+)?)\s*m/i, // Área: 108 m
        /(\d+)\s*metros\s*quadrados/i          // 108 metros quadrados
    ];
    
    for (const pattern of areaPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
            let area = parseFloat(match[1].replace(',', '.'));
            if (area > 15 && area < 2000) { // Área mais realista para apartamentos
                console.log(`📐 Área encontrada: ${Math.round(area)}m²`);
                return Math.round(area);
            }
        }
    }
    
    console.log('❌ Área não encontrada');
    return 0;
}

// Função para extrair preço do texto (melhorada)
function extractPriceFromText(text, searchType) {
    // Limpar CSS e elementos não relacionados com preços
    let cleanText = text.replace(/\.css-[a-zA-Z0-9_-]+[\{\[]/g, ' ');
    cleanText = cleanText.replace(/\d+\s*\/\s*\d+/g, ' '); // Remove frações como "1/25"
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    console.log('💰 Texto para extrair preço (primeiros 150 chars):', cleanText.substring(0, 150));
    
    // Padrões mais específicos para preços - ORDEM IMPORTA
    const pricePatterns = [
        // Para venda: "175 000 €" ou "1 330 000 €" (padrão mais comum)
        /(\d{1,3}(?:\s+\d{3})+)\s*€(?!\s*\/)/g,
        // Formato com pontos: "175.000 €" ou "175,000 €"  
        /(\d{1,3}(?:[,\.]\d{3})+)\s*€(?!\s*\/)/g,
        // Preços sem separadores mas realistas para venda: 150000-2000000
        /(\d{6,7})\s*€(?!\s*\/)/g,
        // Para arrendamento: "750 €/mês" ou "1500 €/mês"
        /(\d{3,4})\s*€\/m[êe]s/g,
        // Preços de arrendamento simples (só se for rent)
        searchType === 'rent' ? /(\d{3,4})\s*€(?!\s*\/)/g : null
    ].filter(Boolean);
    
    let prices = [];
    
    for (const pattern of pricePatterns) {
        let match;
        pattern.lastIndex = 0; // Reset regex
        
        while ((match = pattern.exec(cleanText)) !== null) {
            let priceStr = match[1];
            console.log(`🔍 Match de preço encontrado: "${priceStr}"`);
            
            // Processar string do preço
            let numericStr = priceStr.replace(/\s+/g, '').replace(/[,\.]/g, '');
            let price = parseInt(numericStr);
            
            // Validar range baseado no tipo - RANGES MAIS ESPECÍFICOS
            let isValidRange;
            if (searchType === 'rent') {
                isValidRange = price >= 250 && price <= 8000;
            } else {
                // Para venda - ranges muito mais específicos
                isValidRange = price >= 50000 && price <= 3000000;
            }
            
            if (isValidRange) {
                prices.push(price);
                console.log(`✅ Preço válido: ${price.toLocaleString()}€`);
            } else {
                console.log(`❌ Preço fora do range: ${price.toLocaleString()}€`);
            }
        }
    }
    
    // Retornar o preço mais provável
    if (prices.length > 0) {
        // Para venda: escolher o maior preço válido (principal)
        // Para arrendamento: escolher o menor (mais provável ser mensal)
        const finalPrice = searchType === 'rent' ? Math.min(...prices) : Math.max(...prices);
        console.log(`🎯 Preço final escolhido: ${finalPrice.toLocaleString()}€`);
        return finalPrice;
    }
    
    console.log('❌ Nenhum preço válido encontrado');
    return 0;
}

// FUNÇÃO CORRIGIDA - Melhor matching de localizações
function findSlugFromLocation(locationQuery) {
    console.log(`🔍 A procurar localização: "${locationQuery}"`);
    
    // Verificar estrutura do locations.json
    console.log('📊 Estrutura do locations:', {
        hasDistricts: Array.isArray(locations.districts),
        hasCouncils: Array.isArray(locations.councils),
        hasParishes: Array.isArray(locations.parishes),
        hasNeighborhoods: Array.isArray(locations.neighborhoods),
        locationKeys: Object.keys(locations)
    });
    
    // CORRIGIR: Verificar se locations tem a estrutura FINAL_CONSOLIDATED_DATA
    let allLocationArrays = {};
    
    if (locations.districts && locations.councils && locations.parishes && locations.neighborhoods) {
        // Estrutura direta
        allLocationArrays = locations;
    } else if (Array.isArray(locations) && locations.length > 0) {
        // Estrutura em array - procurar pelo FINAL_CONSOLIDATED_DATA
        const consolidatedData = locations.find(item => item.type === 'FINAL_CONSOLIDATED_DATA');
        if (consolidatedData) {
            allLocationArrays = consolidatedData;
            console.log('✅ Encontrou dados consolidados no array');
        } else {
            console.log('❌ Não encontrou FINAL_CONSOLIDATED_DATA no array');
            return null;
        }
    } else {
        console.log('❌ Estrutura do locations.json não reconhecida');
        return null;
    }
    
    if (!Array.isArray(allLocationArrays.districts) || !Array.isArray(allLocationArrays.councils) || 
        !Array.isArray(allLocationArrays.parishes) || !Array.isArray(allLocationArrays.neighborhoods)) {
        console.log('❌ Arrays de localização inválidos');
        return null;
    }

    const normalized = locationQuery.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    console.log('🔍 Localização normalizada:', normalized);

    // PRIORIDADE ALTERADA: bairros primeiro, depois freguesias
    const allLocations = [
        ...allLocationArrays.neighborhoods.map(n => ({...n, priority: 4})), // PRIORIDADE MÁXIMA para bairros
        ...allLocationArrays.parishes.map(p => ({...p, priority: 3})), // Alta para freguesias
        ...allLocationArrays.councils.map(c => ({...c, priority: 2})), // Média para concelhos
        ...allLocationArrays.districts.map(d => ({...d, priority: 1})) // Baixa para distritos
    ];

    console.log(`📊 Total de ${allLocations.length} localizações para analisar`);

    let bestMatch = null;
    let bestScore = 0;

    for (const location of allLocations) {
        // Normalizar nome da localização
        const locationName = location.name.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Calcular score de matching
        let score = 0;
        
        // Match exacto tem score máximo
        if (normalized.includes(locationName) || locationName.includes(normalized)) {
            score = locationName.length * location.priority * 10;
            
            // Bonus para matches mais específicos
            if (locationName === normalized) {
                score *= 2; // Match exacto completo
            }
            
            console.log(`🎯 Match encontrado: "${location.name}" (${location.level}) (score: ${score})`);
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = location;
            }
        }
    }

    if (bestMatch) {
        console.log(`✅ Melhor match encontrado: ${bestMatch.name} (${bestMatch.level}) - Score: ${bestScore}`);
        console.log(`   Full name: ${bestMatch.fullName}`);
        console.log(`   ID: ${bestMatch.id}`);
        
        return bestMatch;
    }
    
    console.log('❌ Nenhuma localização encontrada');
    return null;
}

// URL CORRIGIDA com formato do ImóVirtual
function buildURL(locationQuery, rooms, searchType, condition) {
    // BASE URL CORRIGIDA
    let baseUrl = 'https://www.imovirtual.com/pt/resultados/';
    baseUrl += searchType === 'rent' ? 'arrendar/apartamento' : 'comprar/apartamento';
    
    // ADICIONAR TIPOLOGIA NA BASE (formato: apartamento,t3)
    if (rooms) {
        const roomNum = rooms.replace('T', '').toLowerCase();
        baseUrl += `,t${roomNum}`;
        console.log(`🏠 Tipologia T${roomNum} adicionada à base URL`);
    }

    const match = findSlugFromLocation(locationQuery);
    if (match) {
        // USAR O ID COMPLETO DO MATCH
        baseUrl += `/${match.id}`;
        console.log(`🎯 URL com localização: ${match.fullName} (${match.level})`);
        console.log(`   ID usado: ${match.id}`);
    } else {
        console.log('🏠 URL sem localização específica');
    }

    // ADICIONAR PARÂMETROS EXTRAS (como no exemplo real)
    const params = new URLSearchParams();
    params.set('limit', '36');
    params.set('ownerTypeSingleSelect', 'ALL');
    params.set('by', 'DEFAULT');
    params.set('direction', 'DESC');

    // Adicionar filtro de estado se especificado
    if (condition) {
        switch (condition) {
            case 'new':
                params.set('search[filter_enum_builttype]', '0'); // Obra nova
                break;
            case 'used':
                params.set('search[filter_enum_builttype]', '1'); // Usado
                break;
            case 'renovated':
                params.set('search[filter_enum_builttype]', '2'); // Renovado
                break;
        }
        console.log(`🏗️ Filtro estado "${condition}" adicionado`);
    }

    const finalUrl = baseUrl + '?' + params.toString();
    return finalUrl;
}

const { location, rooms: searchRooms, searchType, condition } = extractBasics(query);
const searchUrl = buildURL(location, searchRooms, searchType, condition);

console.log('🌐 URL final:', searchUrl);
console.log(`🎯 Pesquisa: ${searchType.toUpperCase()} | Tipologia: ${searchRooms} | Estado: ${condition || 'qualquer'}`);

const results = [];
const debugResults = []; // Array separado para items de debug

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 3,
    requestHandlerTimeoutSecs: 30,
    
    async requestHandler({ $, response, request }) {
        if (response.statusCode !== 200) {
            console.log(`❌ Erro HTTP: ${response.statusCode}`);
            return;
        }
        
        console.log('✅ Página carregada com sucesso');
        console.log('🌐 URL actual:', request.loadedUrl);
        console.log('🎯 URL original solicitado:', request.url);
        
        // Verificar se houve redirecionamento
        if (request.loadedUrl !== request.url) {
            console.log('🔄 REDIRECIONAMENTO DETECTADO!');
            console.log('   Pode indicar que a localização específica tem poucos imóveis');
        }
        
        // SELETORES ATUALIZADOS para novo formato do ImóVirtual
        const selectors = [
            'article[data-cy="listing-item"]',           // Seletor principal
            'div[data-cy="search.listing.organic"]',     // Alternativo
            'article[data-testid="listing-item"]',       // Novo formato
            'article',                                   // Fallback genérico
            '.offer-item',                              // Antigo formato
            '.listing-item'                             // Mais antigo ainda
        ];
        
        let listings = $();
        
        for (const sel of selectors) {
            listings = $(sel);
            if (listings.length > 0) {
                console.log(`📊 ${listings.length} anúncios encontrados com seletor '${sel}'`);
                break;
            }
        }
        
        if (listings.length === 0) {
            console.log('❌ Nenhum anúncio encontrado na página');
            console.log('🔍 HTML snippet:', $('body').html().substring(0, 500));
            return;
        }
        
        let count = 0;
        
        // CORRIGIDO: Usar for loop em vez de .each() para poder usar await
        const listingArray = listings.toArray().slice(0, maxResults * 3);
        
        for (let i = 0; i < listingArray.length && count < maxResults; i++) {
            try {
                const el = listingArray[i];
                const $el = $(el);
                const rawText = $el.text();
                
                console.log(`\n--- ANÚNCIO ${i + 1} ---`);
                
                // LINKS ATUALIZADOS - Novos formatos do ImóVirtual
                const linkSelectors = [
                    'a[href*="/pt/anuncio/"]',                  // Novo formato: /pt/anuncio/apartamento-t1-parque-das-nacoes-ID1h9Q9
                    'a[href*="ID"]',                           // Links com ID
                    'a[href*="/anuncio/"]',                    // Formato sem /pt/
                    'a[href*="/apartamento-"]',                // Formato antigo
                    'a[href^="/pt/"]',                         // Qualquer link que comece com /pt/
                    'a[href]'                                  // Qualquer link como último recurso
                ];
                
                let link = '';
                for (const linkSel of linkSelectors) {
                    const linkEl = $el.find(linkSel).first();
                    link = linkEl.attr('href') || '';
                    if (link && (link.includes('anuncio') || link.includes('apartamento') || link.includes('ID'))) {
                        if (!link.startsWith('http')) {
                            link = 'https://www.imovirtual.com' + link;
                        }
                        console.log(`🔗 Link encontrado com '${linkSel}': ${link.substring(0, 80)}...`);
                        break;
                    }
                }
                
                if (!link) {
                    console.log('❌ Nenhum link válido encontrado');
                    continue;
                }
                
                // TÍTULO MELHORADO - Novos seletores
                let title = '';
                const titleSelectors = [
                    'h2[data-cy="listing-item-title"]',        // Seletor específico do ImóVirtual
                    'h3 a span',
                    'h3 a', 
                    'h2 a span',
                    'h2 a',
                    'h1', 'h2', 'h3',                          // Headers genéricos
                    '[data-cy*="title"]',
                    'a[title]',
                    '.offer-title',                             // Classes antigas
                    '.listing-title'
                ];
                
                for (const sel of titleSelectors) {
                    const titleEl = $el.find(sel).first();
                    title = titleEl.text().trim() || titleEl.attr('title') || '';
                    if (title && title.length > 10 && !title.includes('css-') && !title.match(/^\d+$/)) {
                        console.log(`📋 Título encontrado com '${sel}': ${title.substring(0, 50)}...`);
                        break;
                    }
                }
                
                if (!title || title.length < 10) {
                    title = 'Apartamento para ' + (searchType === 'rent' ? 'arrendamento' : 'venda');
                    console.log('📋 Título fallback usado');
                }
                
                // Extrair dados usando as funções existentes
                const price = extractPriceFromText(rawText, searchType);
                const actualRooms = extractRoomsFromText(rawText) || searchRooms;
                const area = extractAreaFromText(rawText);
                
                console.log(`💰 Preço: ${price.toLocaleString()}€`);
                console.log(`🏠 Tipologia: ${actualRooms}`);
                console.log(`📐 Área: ${area}m²`);
                
                // Critérios de validação mais flexíveis
                const searchRoomNum = searchRooms ? parseInt(searchRooms.replace('T', '')) : 0;
                const actualRoomNum = actualRooms ? parseInt(actualRooms.replace('T', '')) : 0;
                
                // Validações
                const hasValidPrice = price > 0;
                const hasTitle = title && title.length > 10;
                const roomsMatch = !searchRooms || Math.abs(actualRoomNum - searchRoomNum) <= 1; // ±1 tolerância
                
                // Range de preços mais realista
                let priceInRange;
                if (searchType === 'rent') {
                    priceInRange = price >= 200 && price <= 5000;
                } else {
                    priceInRange = price >= 25000 && price <= 2000000;
                }
                
                const isValid = hasValidPrice && hasTitle && roomsMatch && priceInRange;
                
                // Criar objeto do anúncio
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
                    searchedRooms: searchRooms,
                    searchType: searchType,
                    condition: condition,
                    propertyIndex: count + 1,
                    totalProperties: maxResults,
                    priceFormatted: `${price.toLocaleString()} €`,
                    areaFormatted: `${area} m²`,
                    pricePerSqmFormatted: area > 0 ? `${Math.round(price / area).toLocaleString()} €/m²` : 'N/A',
                    timestamp: new Date().toISOString(),
                    isValidMatch: isValid,
                    searchUrl: request.loadedUrl
                };
                
                if (isValid) {
                    results.push(property);
                    count++;
                    
                    const typeIcon = searchType === 'rent' ? '🏠' : '💰';
                    const conditionIcon = condition === 'new' ? '🆕' : condition === 'used' ? '🏠' : condition === 'renovated' ? '🔨' : '';
                    console.log(`✅ ${count}. ${typeIcon}${conditionIcon} ADICIONADO: ${actualRooms} - ${area}m² - ${price.toLocaleString()}€`);
                } else {
                    // Log detalhado para debugging
                    console.log(`❌ REJEITADO (mas link capturado):`);
                    if (!hasValidPrice) console.log(`   - Preço inválido: ${price}`);
                    if (!hasTitle) console.log(`   - Título inválido: "${title}"`);
                    if (!roomsMatch) console.log(`   - Tipologia não match: ${actualRooms} vs ${searchRooms}`);
                    if (!priceInRange) console.log(`   - Preço fora do range: ${price.toLocaleString()}€`);
                    
                    // Para debugging, adicionar ao array de debug
                    debugResults.push({
                        ...property,
                        debugReason: 'não_match_criterios',
                        validationIssues: {
                            hasValidPrice,
                            hasTitle,
                            roomsMatch,
                            priceInRange
                        }
                    });
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
        console.log('⚠️ Nenhum resultado válido encontrado na pesquisa específica.');
        console.log('🔄 A tentar URL mais genérica (sem localização específica)...');
        
        // Tentar sem localização específica se não encontrou nada
        const fallbackUrl = buildURL('', searchRooms, searchType, condition);
        console.log('🔗 URL alternativa:', fallbackUrl);
        await crawler.run([fallbackUrl]);
        
        // Se ainda não encontrou nada, tentar só com a tipologia
        if (results.length === 0) {
            console.log('🔄 A tentar pesquisa ainda mais genérica (só tipologia)...');
            let genericUrl = `https://www.imovirtual.com/pt/resultados/${searchType === 'rent' ? 'arrendar' : 'comprar'}/apartamento`;
            
            if (searchRooms) {
                const roomNum = searchRooms.replace('T', '').toLowerCase();
                genericUrl += `,t${roomNum}`;
            }
            
            genericUrl += '?limit=36&ownerTypeSingleSelect=ALL&by=DEFAULT&direction=DESC';
            console.log('🔗 URL genérica final:', genericUrl);
            await crawler.run([genericUrl]);
        }
    }
    
    // Guardar resultados válidos
    await Actor.pushData(results);
    
    // Guardar resultados de debug separadamente
    if (debugResults.length > 0) {
        console.log(`🔍 A guardar ${debugResults.length} items de debug...`);
        for (const debugItem of debugResults) {
            await Actor.pushData(debugItem);
        }
    }
    
    console.log(`✅ Scraping concluído: ${results.length} resultados válidos + ${debugResults.length} debug salvos`);
    
} catch (error) {
    console.log('❌ Erro no scraping:', error.message);
    await Actor.pushData(results); // Salvar o que conseguiu mesmo com erro
    
} finally {
    await Actor.exit();
}
