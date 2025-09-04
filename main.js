import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';
import locations from './locations.json' with { type: 'json' };

await Actor.init();

const input = await Actor.getInput();
const query = input?.query || 'T4 caldas da rainha';
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

// FUNÇÃO CORRIGIDA PARA EXTRAIR PREÇO - Mais robusta
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
function findSlugFromLocation(query) {
    const normalized = query.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    console.log('🔍 A procurar localização normalizada:', normalized);
    
    if (!Array.isArray(locations.districts) || !Array.isArray(locations.councils) || 
        !Array.isArray(locations.parishes) || !Array.isArray(locations.neighborhoods)) {
        console.log('❌ Estrutura do locations.json inválida');
        return null;
    }

    const allLocations = [
        ...locations.parishes.map(p => ({...p, priority: 3})), // Prioridade alta para freguesias
        ...locations.neighborhoods.map(n => ({...n, priority: 3})), // Prioridade alta para bairros
        ...locations.councils.map(c => ({...c, priority: 2})), // Média para concelhos
        ...locations.districts.map(d => ({...d, priority: 1})) // Baixa para distritos
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
        if (normalized.includes(locationName)) {
            score = locationName.length * location.priority * 10;
            
            // Bonus para matches mais específicos
            if (locationName === normalized) {
                score *= 2; // Match exacto completo
            }
            
            console.log(`🎯 Match encontrado: "${location.name}" (score: ${score})`);
            
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
        
        // Extrair componentes do ID
        const idParts = bestMatch.id.split('/');
        
        return {
            district: idParts[0] || null,
            concelho: idParts[1] || null,
            slug: idParts[2] || idParts[1] || idParts[0] || null,
            level: bestMatch.level,
            fullName: bestMatch.fullName
        };
    } else {
        // Fallback: se não encontrou "Santo António dos Cavaleiros", tentar "Loures"
        console.log('❌ Localização específica não encontrada. Tentando fallback para "Loures"...');
        
        for (const location of allLocations) {
            const locationName = location.name.normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase();
                
            if (locationName === 'loures' && location.level === 'council') {
                console.log(`✅ Fallback encontrado: ${location.name} (concelho)`);
                const idParts = location.id.split('/');
                
                return {
                    district: idParts[0] || null,
                    concelho: idParts[1] || null,
                    slug: idParts[1] || null, // Para concelho, slug é o mesmo
                    level: location.level,
                    fullName: location.fullName
                };
            }
        }
    }
    
    console.log('❌ Nenhuma localização encontrada (nem fallback)');
    return null;
}

// URL que suporta rent e buy - CORRIGIDA
function buildURL(query, rooms, searchType, condition) {
    let baseUrl = 'https://www.imovirtual.com/';
    baseUrl += searchType === 'rent' ? 'arrendar/apartamento' : 'comprar/apartamento';

    const match = findSlugFromLocation(query);
    if (match) {
        // Construir URL baseado no nível encontrado
        if (match.level === 'parish' && match.district && match.concelho && match.slug) {
            baseUrl += `/${match.district}/${match.concelho}/${match.slug}`;
            console.log(`🏠 URL com freguesia: ${match.fullName}`);
        } else if (match.level === 'council' && match.district && match.concelho) {
            baseUrl += `/${match.district}/${match.concelho}`;
            console.log(`🏠 URL com concelho: ${match.fullName}`);
        } else if (match.level === 'district' && match.district) {
            baseUrl += `/${match.district}`;
            console.log(`🏠 URL com distrito: ${match.fullName}`);
        } else if (match.level === 'neighborhood' && match.district && match.concelho && match.slug) {
            baseUrl += `/${match.district}/${match.concelho}/${match.slug}`;
            console.log(`🏠 URL com bairro: ${match.fullName}`);
        }
    } else {
        console.log('🏠 URL sem localização específica');
    }

    // Adicionar filtros de tipologia
    if (rooms) {
        const num = rooms.replace('T', '');
        const separator = baseUrl.includes('?') ? '&' : '?';
        baseUrl += `${separator}search%5Bfilter_float_number_of_rooms%3Afrom%5D=${num}&search%5Bfilter_float_number_of_rooms%3Ato%5D=${num}`;
        console.log(`🏠 Filtro tipologia T${num} adicionado`);
    }

    // Adicionar filtro de estado se especificado
    if (condition) {
        const separator = baseUrl.includes('?') ? '&' : '?';
        switch (condition) {
            case 'new':
                baseUrl += `${separator}search%5Bfilter_enum_builttype%5D=0`; // Obra nova
                break;
            case 'used':
                baseUrl += `${separator}search%5Bfilter_enum_builttype%5D=1`; // Usado
                break;
            case 'renovated':
                baseUrl += `${separator}search%5Bfilter_enum_builttype%5D=2`; // Renovado
                break;
        }
        console.log(`🏗️ Filtro estado "${condition}" adicionado`);
    }

    return baseUrl;
}

const { location, rooms: searchRooms, searchType, condition } = extractBasics(query);
const searchUrl = buildURL(query, searchRooms, searchType, condition);

console.log('🌐 URL final:', searchUrl);
console.log(`🎯 Pesquisa: ${searchType.toUpperCase()} | Tipologia: ${searchRooms} | Estado: ${condition || 'qualquer'}`);

const results = [];

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 3,
    requestHandlerTimeoutSecs: 30,
    
    async requestHandler({ $, response }) {
        if (response.statusCode !== 200) {
            console.log(`❌ Erro HTTP: ${response.statusCode}`);
            return;
        }
        
        console.log('✅ Página carregada com sucesso');
        
        // Tentar diferentes seletores
        const selectors = [
            'article[data-cy="listing-item"]',
            'article',
            '[data-cy*="listing"]',
            '.offer-item',
            '.listing-item'
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
            return;
        }
        
        let count = 0;
        
        listings.slice(0, maxResults * 3).each((i, el) => {
            if (count >= maxResults) return false;
            
            try {
                const $el = $(el);
                const rawText = $el.text();
                
                console.log(`\n--- ANÚNCIO ${i + 1} ---`);
                
                // Link
                const linkEl = $el.find('a[href*="/apartamento-"], a[href*="/anuncio/"]').first();
                let link = linkEl.attr('href') || '';
                if (link && !link.startsWith('http')) {
                    link = 'https://www.imovirtual.com' + link;
                }
                
                // Título melhorado
                let title = '';
                const titleSelectors = [
                    'h3 a span',
                    'h3 a', 
                    'h2 a span',
                    'h2 a',
                    '[data-cy*="title"]',
                    'a[title]'
                ];
                
                for (const sel of titleSelectors) {
                    const titleEl = $el.find(sel).first();
                    title = titleEl.text().trim() || titleEl.attr('title') || '';
                    if (title && title.length > 10 && !title.includes('css-')) {
                        break;
                    }
                }
                
                if (!title || title.length < 10) {
                    title = linkEl.text().trim() || 'Apartamento para venda';
                }
                
                console.log(`📋 Título: ${title.substring(0, 80)}...`);
                
                // Extrair dados usando as funções corrigidas
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
                        searchedRooms: searchRooms,
                        searchType: searchType,
                        condition: condition,
                        propertyIndex: count + 1,
                        totalProperties: maxResults,
                        priceFormatted: `${price.toLocaleString()} €`,
                        areaFormatted: `${area} m²`,
                        pricePerSqmFormatted: area > 0 ? `${Math.round(price / area).toLocaleString()} €/m²` : 'N/A',
                        timestamp: new Date().toISOString()
                    };
                    
                    results.push(property);
                    count++;
                    
                    const typeIcon = searchType === 'rent' ? '🏠' : '💰';
                    const conditionIcon = condition === 'new' ? '🆕' : condition === 'used' ? '🏠' : condition === 'renovated' ? '🔨' : '';
                    console.log(`✅ ${count}. ${typeIcon}${conditionIcon} ADICIONADO: ${actualRooms} - ${area}m² - ${price.toLocaleString()}€`);
                } else {
                    // Log detalhado para debugging
                    console.log(`❌ REJEITADO:`);
                    if (!hasValidPrice) console.log(`   - Preço inválido: ${price}`);
                    if (!hasTitle) console.log(`   - Título inválido: "${title}"`);
                    if (!roomsMatch) console.log(`   - Tipologia não match: ${actualRooms} vs ${searchRooms}`);
                    if (!priceInRange) console.log(`   - Preço fora do range: ${price.toLocaleString()}€`);
                }
                
            } catch (error) {
                console.log(`⚠️ Erro no anúncio ${i + 1}:`, error.message);
            }
        });
        
        console.log(`\n🎉 RESULTADO: ${count} de ${listings.length} anúncios válidos encontrados`);
    },
    
    failedRequestHandler({ request, error }) {
        console.log(`❌ Falha na requisição ${request.url}: ${error.message}`);
    }
});

try {
    await crawler.run([searchUrl]);
    
    if (results.length === 0) {
        console.log('⚠️ Nenhum resultado encontrado. A tentar URL alternativa...');
        
        // Tentar sem localização específica se não encontrou nada
        const fallbackUrl = buildURL('', searchRooms, searchType, condition);
        console.log('🔄 URL alternativa:', fallbackUrl);
        await crawler.run([fallbackUrl]);
    }
    
    await Actor.pushData(results);
    console.log(`✅ Scraping concluído: ${results.length} resultados salvos`);
    
} catch (error) {
    console.log('❌ Erro no scraping:', error.message);
    await Actor.pushData(results); // Salvar o que conseguiu mesmo com erro
    
} finally {
    await Actor.exit();
}
