import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

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

// Extrair apenas o essencial
function extractBasics(query) {
    const location = query.match(/caldas da rainha|lisboa|porto|coimbra|braga|loures|sintra|cascais|almada|amadora/i)?.[0]?.toLowerCase() || '';
    const rooms = query.match(/T(\d)/i)?.[0]?.toUpperCase() || '';
    const searchType = detectSearchType(query);
    
    return { location, rooms, searchType };
}

// Função para extrair tipologia do texto (melhorada)
function extractRoomsFromText(text) {
    // Limpar CSS primeiro
    let cleanText = text.replace(/\.css-[a-z0-9]+\{[^}]*\}/gi, ' ');
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    console.log('🔍 Texto para extrair tipologia:', cleanText.substring(0, 150));
    
    // Procurar múltiplos padrões T1, T2, T3, etc. no texto
    const allMatches = cleanText.match(/T(\d+)/gi);
    
    if (allMatches && allMatches.length > 0) {
        console.log('🏠 Tipologias encontradas:', allMatches);
        
        // Se encontrou várias, pegar a mais comum ou a primeira que não seja do título
        const counts = {};
        allMatches.forEach(match => {
            const rooms = match.toUpperCase();
            counts[rooms] = (counts[rooms] || 0) + 1;
        });
        
        // Retornar a tipologia mais frequente
        const mostCommon = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
        console.log('🎯 Tipologia escolhida:', mostCommon);
        return mostCommon;
    }
    
    console.log('❌ Nenhuma tipologia encontrada');
    return '';
}

// Função para extrair área do texto (melhorada)
function extractAreaFromText(text) {
    // Primeiro limpar o texto de CSS classes
    let cleanText = text.replace(/\.css-[a-z0-9]+\{[^}]*\}/gi, ' ');
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    const areaPatterns = [
        /([\d]+[,\.]\d+)\s*m[²2]/i,    // 108,28 m² ou 108.28 m²
        /([\d]+)\s*m[²2]/i,           // 108 m²
        /([\d]+[,\.]\d+)\s*m\s/i,     // 108,28 m (espaço)
        /([\d]+)\s*m\s/i              // 108 m (espaço)
    ];
    
    for (const pattern of areaPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
            // Converter vírgulas para pontos e fazer parse
            let area = parseFloat(match[1].replace(',', '.'));
            if (area > 20 && area < 1000) { // Área realista
                return Math.round(area); // Arredondar para inteiro
            }
        }
    }
    return 0;
}

// FUNÇÃO CORRIGIDA PARA EXTRAIR PREÇO
function extractPriceFromText(text) {
    // Limpar CSS primeiro
    let cleanText = text.replace(/\.css-[a-z0-9]+\{[^}]*\}/gi, ' ');
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    console.log('🔍 Texto para extrair preço:', cleanText.substring(0, 100));
    
    // Padrões de preço mais específicos
    const pricePatterns = [
        // Formato: "233 000 €" ou "1 330 000 €"
        /(\d{1,3}(?:\s+\d{3})*)\s*€/g,
        // Formato alternativo: "233.000 €" ou "233,000 €"  
        /(\d{1,3}(?:[,\.]\d{3})*)\s*€/g,
        // Formato simples: "233000 €"
        /(\d{4,7})\s*€/g
    ];
    
    let bestPrice = 0;
    let bestMatch = '';
    
    for (const pattern of pricePatterns) {
        let match;
        pattern.lastIndex = 0; // Reset regex
        
        while ((match = pattern.exec(cleanText)) !== null) {
            let priceStr = match[1];
            console.log(`🔍 Match encontrado: "${priceStr}"`);
            
            // Limpar espaços e converter para número
            let numericStr = priceStr.replace(/\s+/g, '').replace(/[,\.]/g, '');
            let price = parseInt(numericStr);
            
            console.log(`💰 Preço processado: ${price.toLocaleString()}€`);
            
            // Verificar se está no range realista (50k a 2M)
            if (price >= 50000 && price <= 2000000) {
                if (price > bestPrice) {
                    bestPrice = price;
                    bestMatch = priceStr;
                }
            } else {
                console.log(`❌ Preço ${price.toLocaleString()}€ fora do range 50k-2M`);
            }
        }
    }
    
    if (bestPrice > 0) {
        console.log(`✅ Melhor preço encontrado: ${bestPrice.toLocaleString()}€ (match: "${bestMatch}")`);
    } else {
        console.log('❌ Nenhum preço válido encontrado');
    }
    
    return bestPrice;
}

// URL que suporta rent e buy
function buildURL(location, rooms, searchType) {
    let baseUrl = 'https://www.imovirtual.com/';
    
    // Escolher entre arrendamento ou compra
    if (searchType === 'rent') {
        baseUrl += 'arrendar/apartamento';
    } else {
        baseUrl += 'comprar/apartamento';
    }
    
    if (location) {
        baseUrl += `/${location.replace(/\s+/g, '-')}`;
    }
    
    if (rooms) {
        const num = rooms.replace('T', '');
        baseUrl += `?search%255Bfilter_float_number_of_rooms%253Afrom%255D=${num}&search%255Bfilter_float_number_of_rooms%253Ato%255D=${num}`;
    }
    
    return baseUrl;
}

const { location, rooms: searchRooms, searchType } = extractBasics(query);
const searchUrl = buildURL(location, searchRooms, searchType);

console.log('🌐 URL:', searchUrl);
console.log(`🎯 Tipo de pesquisa: ${searchType.toUpperCase()}`);

const results = [];

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 3,
    requestHandlerTimeoutSecs: 20,
    
    async requestHandler({ $, response }) {
        if (response.statusCode !== 200) {
            console.log('❌ Erro:', response.statusCode);
            return;
        }
        
        console.log('✅ Página carregada');
        
        // Tentar diferentes seletores simples
        const selectors = ['article', '[data-cy*="listing"]', '.offer-item'];
        let listings = $();
        
        for (const sel of selectors) {
            listings = $(sel);
            if (listings.length > 0) {
                console.log(`📊 ${listings.length} anúncios com '${sel}'`);
                break;
            }
        }
        
        let count = 0;
        
        listings.slice(0, maxResults * 2).each((i, el) => {
            if (count >= maxResults) return false; // Para quando atingir o limite
            
            try {
                const $el = $(el);
                const text = $el.text();
                
                console.log(`\n--- ANÚNCIO ${i + 1} ---`);
                
                // Link
                const linkEl = $el.find('a').first();
                let link = linkEl.attr('href') || '';
                if (link && !link.startsWith('http')) {
                    link = 'https://www.imovirtual.com' + link;
                }
                
                // Título - melhor extração
                let title = '';
                const titleSelectors = ['h3', 'h2', '[data-cy*="title"]', 'a[title]'];
                for (const sel of titleSelectors) {
                    const titleEl = $el.find(sel).first();
                    title = titleEl.text().trim() || titleEl.attr('title') || '';
                    if (title && !title.includes('css-') && title.length > 10) break;
                }
                
                // Se ainda não tem título válido, usar texto do link
                if (!title || title.includes('css-')) {
                    title = linkEl.text().trim();
                    if (title.includes('css-')) title = 'Imóvel para venda';
                }
                
                console.log(`📋 Título: ${title.substring(0, 50)}...`);
                
                // USAR A FUNÇÃO CORRIGIDA PARA EXTRAIR PREÇO
                const price = extractPriceFromText(text);
                
                // CORRIGIDO: Melhor extração de tipologia
                // Extrair do texto completo do anúncio, não apenas do título
                let actualRooms = extractRoomsFromText(text);
                
                // Se não encontrou no texto completo, tentar no título como fallback
                if (!actualRooms) {
                    actualRooms = extractRoomsFromText(title) || searchRooms;
                    console.log('⚠️ Usando tipologia do título como fallback:', actualRooms);
                } else {
                    console.log('✅ Tipologia extraída do conteúdo:', actualRooms);
                }
                
                // Validação adicional: se a URL de pesquisa era específica para uma tipologia,
                // mas encontramos outra muito diferente, pode ser erro de parsing
                const searchRoomNumValidation = parseInt(searchRooms.replace('T', ''));
                const actualRoomNumValidation = parseInt(actualRooms.replace('T', ''));
                
                // Se a diferença for muito grande (>2), investigar mais
                if (Math.abs(actualRoomNumValidation - searchRoomNumValidation) > 2) {
                    console.log('🤔 Grande diferença tipológica detectada. Investigando...');
                    console.log('   Texto do anúncio (200 chars):', text.substring(0, 200));
                    
                    // Tentar encontrar padrões mais específicos
                    const specificPatterns = [
                        /Tipologia\s*:?\s*T(\d+)/i,
                        /Apartment\s+T(\d+)/i,
                        /(\d+)\s+bedroom/i,
                        /(\d+)\s+quartos/i
                    ];
                    
                    for (const pattern of specificPatterns) {
                        const match = text.match(pattern);
                        if (match) {
                            const foundRooms = `T${match[1]}`;
                            console.log(`🔍 Padrão específico encontrado: ${foundRooms}`);
                            actualRooms = foundRooms;
                            break;
                        }
                    }
                }
                
                // CORRIGIDO: Melhor extração de área
                const area = extractAreaFromText(text);
                
                console.log(`🏠 Tipologia FINAL: ${actualRooms}, Área: ${area}m², Preço: ${price.toLocaleString()}€`);
                
                // ESTRATÉGIA DE FILTROS EM CASCATA
                const searchRoomNum = parseInt(searchRooms.replace('T', ''));
                const actualRoomNum = parseInt(actualRooms.replace('T', ''));
                
                // Verificar se contém a localização (se foi especificada)
                const locationMatch = !location || text.toLowerCase().includes(location.toLowerCase());
                
                // Primeiro: tentar encontrar tipologia exata
                const isExactMatch = actualRoomNum === searchRoomNum;
                
                // Segundo: se não houver suficientes exatos, aceitar ±1
                const isCloseMatch = Math.abs(actualRoomNum - searchRoomNum) <= 1;
                
                // Terceiro: preços realistas - AJUSTAR RANGES BASEADO NO TIPO
                let isPriceRealistic;
                if (searchType === 'rent') {
                    // Para arrendamento: 300€ - 3000€
                    isPriceRealistic = price >= 300 && price <= 3000;
                } else {
                    // Para compra: 80k - 800k
                    isPriceRealistic = price >= 80000 && price <= 800000;
                }
                
                // Marcar o tipo de match para o agente usar na análise
                let matchType = 'none';
                if (isExactMatch && isPriceRealistic && locationMatch) {
                    matchType = 'exact';
                } else if (isCloseMatch && isPriceRealistic && locationMatch) {
                    matchType = 'close';
                }
                
                // Só guardar se for match válido
                if (title && price > 0 && matchType !== 'none') {
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
                        searchType: searchType, // NOVO: tipo de pesquisa
                        matchType: matchType,
                        propertyIndex: count + 1,
                        totalProperties: maxResults,
                        priceFormatted: `${price.toLocaleString()} €`,
                        areaFormatted: `${area} m²`,
                        pricePerSqmFormatted: area > 0 ? `${Math.round(price / area).toLocaleString()} €/m²` : 'N/A',
                        timestamp: new Date().toISOString()
                    };
                    
                    results.push(property);
                    count++;
                    
                    const matchIcon = matchType === 'exact' ? '🎯' : '📍';
                    const typeIcon = searchType === 'rent' ? '🏠' : '💰';
                    console.log(`✅ ${count}. ${matchIcon}${typeIcon} ADICIONADO: ${actualRooms} - ${area}m² - ${price.toLocaleString()}€`);
                } else {
                    // Debug para itens rejeitados
                    if (price === 0) {
                        console.log(`❌ Rejeitado: sem preço válido`);
                    } else if (!isPriceRealistic) {
                        const range = searchType === 'rent' ? '300-3000€' : '80k-800k€';
                        console.log(`❌ Rejeitado (preço): ${price.toLocaleString()}€ fora do range ${range}`);
                    } else if (Math.abs(actualRoomNum - searchRoomNum) > 1) {
                        console.log(`❌ Rejeitado (tipologia): ${actualRooms} muito diferente de ${searchRooms}`);
                    } else if (!locationMatch) {
                        console.log(`❌ Rejeitado (localização): não contém "${location}"`);
                    } else {
                        console.log(`❌ Rejeitado: critérios não atendidos`);
                    }
                }
                
            } catch (e) {
                console.log('⚠️ Erro item:', e.message);
            }
        });
        
        console.log(`\n🎉 RESULTADO FINAL: ${count} imóveis válidos encontrados`);
    }
});

try {
    await crawler.run([searchUrl]);
    await Actor.pushData(results);
    console.log('✅ Concluído:', results.length, 'resultados');
} catch (error) {
    console.log('❌ Erro:', error.message);
    await Actor.pushData(results); // Salvar o que conseguiu
}

await Actor.exit();
