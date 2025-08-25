import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput();
const query = input?.query || 'T4 caldas da rainha';
const maxResults = input?.max_resultados || 5;

console.log('🔍 Query:', query);

// Extrair apenas o essencial
function extractBasics(query) {
    const location = query.match(/caldas da rainha|lisboa|porto|coimbra|braga/i)?.[0]?.toLowerCase() || '';
    const rooms = query.match(/T(\d)/i)?.[0]?.toUpperCase() || '';
    return { location, rooms };
}

// Função para extrair tipologia do texto
function extractRoomsFromText(text) {
    // Limpar CSS primeiro
    let cleanText = text.replace(/\.css-[a-z0-9]+\{[^}]*\}/gi, ' ');
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    // Procurar por padrões T1, T2, T3, etc.
    const roomsMatch = cleanText.match(/T(\d+)/i);
    return roomsMatch ? roomsMatch[0].toUpperCase() : '';
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

// URL simples
function buildURL(location, rooms) {
    let url = 'https://www.imovirtual.com/comprar/apartamento';
    
    if (location) {
        url += `/${location.replace(/\s+/g, '-')}`;
    }
    
    if (rooms) {
        const num = rooms.replace('T', '');
        url += `?search%255Bfilter_float_number_of_rooms%253Afrom%255D=${num}&search%255Bfilter_float_number_of_rooms%253Ato%255D=${num}`;
    }
    
    return url;
}

const { location, rooms: searchRooms } = extractBasics(query);
const searchUrl = buildURL(location, searchRooms);

console.log('🌐 URL:', searchUrl);

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
        
        listings.slice(0, maxResults).each((i, el) => {
            try {
                const $el = $(el);
                const text = $el.text();
                
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
                
                // Preço
                let price = 0;
                const priceMatch = text.match(/([\d\s]+)\s*€/);
                if (priceMatch) {
                    price = parseInt(priceMatch[1].replace(/\s/g, ''));
                }
                
                // CORRIGIDO: Extrair tipologia do texto atual (não da query)
                const actualRooms = extractRoomsFromText(text) || extractRoomsFromText(title) || searchRooms;
                
                // CORRIGIDO: Melhor extração de área
                const area = extractAreaFromText(text);
                
                // Debug melhorado para verificar extração
                if (area === 0 || count === 0) {
                    console.log('⚠️  Debug elemento', count + 1);
                    console.log('   Texto original (100 chars):', text.substring(0, 100));
                    
                    // Texto limpo
                    let cleanText = text.replace(/\.css-[a-z0-9]+\{[^}]*\}/gi, ' ');
                    cleanText = cleanText.replace(/\s+/g, ' ').trim();
                    console.log('   Texto limpo (200 chars):', cleanText.substring(0, 200));
                    
                    // Procurar área especificamente
                    const areaMatch = cleanText.match(/([\d]+)\s*m[²2]/i);
                    if (areaMatch) {
                        console.log('   🎯 Área encontrada:', areaMatch[1], 'm²');
                    } else {
                        console.log('   ❌ Área não encontrada no texto limpo');
                    }
                }
                
                // Só guardar se tiver dados básicos
                if (title && (price > 0 || link)) {
                    const property = {
                        title: title.substring(0, 200), // Limitar tamanho
                        price: price,
                        area: area,
                        rooms: actualRooms, // CORRIGIDO: usar tipologia extraída
                        location: location,
                        pricePerSqm: area > 0 ? Math.round(price / area) : 0,
                        link: link,
                        site: 'ImóVirtual',
                        searchQuery: query,
                        propertyIndex: count + 1,
                        totalProperties: maxResults,
                        priceFormatted: `${price.toLocaleString()} €`,
                        areaFormatted: `${area} m²`,
                        pricePerSqmFormatted: area > 0 ? `${Math.round(price / area).toLocaleString()} €/m²` : 'N/A',
                        timestamp: new Date().toISOString()
                    };
                    
                    results.push(property);
                    count++;
                    
                    console.log(`✅ ${count}. ${actualRooms} - ${title.substring(0, 30)}... - ${area}m² - ${price.toLocaleString()}€`);
                }
                
            } catch (e) {
                console.log('⚠️ Erro item:', e.message);
            }
        });
        
        // Atualizar contadores (para debug)
        console.log(`🎉 Encontrados ${count} imóveis válidos de ${listings.length} total`);
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
