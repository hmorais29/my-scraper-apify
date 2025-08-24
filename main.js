import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput() || {};
console.log('🔥 Input recebido:', input);

const query = input.query || 'Imóvel T3 Lisboa';
console.log(`🔍 Query: "${query}"`);

// Função para extrair critérios da query
function extractCriteria(query) {
    const criteria = {
        location: '',
        rooms: '',
        area: '',
        condition: '',
        type: 'apartamento',
        originalQuery: query
    };
    
    const queryLower = query.toLowerCase();
    
    // Extrair tipologia (T1, T2, T3, T4, T5)
    const roomsMatch = queryLower.match(/t([0-9])/);
    if (roomsMatch) {
        criteria.rooms = 'T' + roomsMatch[1];
    }
    
    // Extrair localização (última palavra/palavras significativas)
    const locationWords = queryLower.replace(/imóvel|apartamento|casa|moradia|t[0-9]/g, '').trim().split(' ').filter(w => w.length > 2);
    criteria.location = locationWords.join(' ');
    
    return criteria;
}

// Função para construir URL do Imovirtual (versão melhorada)
function buildImovirtualUrl(criteria) {
    // URL base mais simples
    let baseUrl = 'https://www.imovirtual.com/comprar/apartamento';
    
    if (criteria.location) {
        // Limpar e formatar localização
        const cleanLocation = criteria.location
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[àáâãä]/g, 'a')
            .replace(/[èéêë]/g, 'e')
            .replace(/[ìíîï]/g, 'i')
            .replace(/[òóôõö]/g, 'o')
            .replace(/[ùúûü]/g, 'u')
            .replace(/ç/g, 'c')
            .replace(/[^a-z0-9-]/g, '');
        
        baseUrl += `/${cleanLocation}`;
    }
    
    // Adicionar parâmetros via query string
    const params = new URLSearchParams();
    
    if (criteria.rooms) {
        const roomNumber = criteria.rooms.replace('T', '');
        params.append('search[filter_float_number_of_rooms:from]', roomNumber);
        params.append('search[filter_float_number_of_rooms:to]', roomNumber);
    }
    
    const finalUrl = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
    
    return finalUrl;
}

// Função para scraping do Imovirtual com múltiplos seletores
async function scrapeImovirtual($, url) {
    console.log('\n🏠 Processando Imovirtual...');
    console.log(`🌐 URL atual: ${url}`);
    
    const properties = [];
    
    // Múltiplos seletores para diferentes versões do site
    const possibleSelectors = [
        '[data-cy="listing-item"]',
        '.offer-item',
        '.listing-item',
        '[data-testid="listing-item"]',
        '.property-item',
        '.search-results article',
        'article[data-item-id]',
        '.offers-index article'
    ];
    
    let listingElements = $();
    let usedSelector = '';
    
    // Tentar cada seletor até encontrar elementos
    for (const selector of possibleSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
            listingElements = elements;
            usedSelector = selector;
            break;
        }
    }
    
    console.log(`📊 Seletor usado: "${usedSelector}"`);
    console.log(`📊 Encontrados ${listingElements.length} elementos`);
    
    // Debug: mostrar estrutura da página se não encontrou elementos
    if (listingElements.length === 0) {
        console.log('\n🔍 DEBUG: Estrutura da página:');
        console.log('Classes principais encontradas:');
        
        const classes = new Set();
        $('[class]').each((i, el) => {
            const classList = $(el).attr('class').split(/\s+/);
            classList.forEach(cls => {
                if (cls.length > 3 && !cls.includes('icon') && !cls.includes('svg')) {
                    classes.add(cls);
                }
            });
        });
        
        Array.from(classes).slice(0, 20).forEach(cls => {
            console.log(`  - .${cls} (${$('.' + cls).length} elementos)`);
        });
        
        console.log('\nIDs principais encontrados:');
        $('[id]').each((i, el) => {
            const id = $(el).attr('id');
            if (id && id.length > 3) {
                console.log(`  - #${id}`);
            }
        });
        
        console.log('\nData attributes encontrados:');
        $('[data-cy], [data-testid], [data-item]').each((i, el) => {
            const attrs = [];
            if ($(el).attr('data-cy')) attrs.push(`data-cy="${$(el).attr('data-cy')}"`);
            if ($(el).attr('data-testid')) attrs.push(`data-testid="${$(el).attr('data-testid')}"`);
            if ($(el).attr('data-item-id')) attrs.push(`data-item-id="${$(el).attr('data-item-id')}"`);
            if (attrs.length > 0) {
                console.log(`  - ${attrs.join(', ')}`);
            }
        });
    }
    
    listingElements.each((index, element) => {
        try {
            const $listing = $(element);
            
            // Múltiplos seletores para título
            const titleSelectors = [
                'h3 a',
                'h2 a', 
                '.offer-item-title a',
                '[data-cy="listing-item-link"]',
                '.property-title a',
                'a[title]',
                '.listing-title'
            ];
            
            let title = '';
            let link = '';
            
            for (const selector of titleSelectors) {
                const titleEl = $listing.find(selector).first();
                if (titleEl.length > 0) {
                    title = titleEl.text().trim();
                    link = titleEl.attr('href');
                    if (title) break;
                }
            }
            
            // Múltiplos seletores para preço
            const priceSelectors = [
                '[data-cy="price"]',
                '.price',
                '.offer-item-price',
                '.property-price',
                '[class*="price"]',
                '.listing-price'
            ];
            
            let priceText = '';
            for (const selector of priceSelectors) {
                const priceEl = $listing.find(selector).first();
                if (priceEl.length > 0 && priceEl.text().trim()) {
                    priceText = priceEl.text().trim();
                    break;
                }
            }
            
            // Múltiplos seletores para área
            const areaSelectors = [
                '[title*="m²"]',
                '[class*="area"]',
                '.offer-item-area',
                '.property-area',
                '.listing-area'
            ];
            
            let areaText = '';
            for (const selector of areaSelectors) {
                const areaEl = $listing.find(selector).first();
                if (areaEl.length > 0 && areaEl.text().trim()) {
                    areaText = areaEl.text().trim();
                    break;
                }
            }
            
            // Múltiplos seletores para localização
            const locationSelectors = [
                '[class*="location"]',
                '[class*="address"]',
                '.offer-item-location',
                '.property-location',
                '.listing-location'
            ];
            
            let locationText = '';
            for (const selector of locationSelectors) {
                const locEl = $listing.find(selector).first();
                if (locEl.length > 0 && locEl.text().trim()) {
                    locationText = locEl.text().trim();
                    break;
                }
            }
            
            // Extrair tipologia do título
            let rooms = '';
            if (title) {
                const roomsMatch = title.match(/T([0-9])/i);
                if (roomsMatch) {
                    rooms = 'T' + roomsMatch[1];
                }
            }
            
            // Processar localização
            let location = locationText || 'N/A';
            if (title && title.toLowerCase().includes('caldas da rainha')) {
                location = 'Caldas da Rainha';
            }
            
            if (title && title.length > 5) {
                const property = {
                    title,
                    price: priceText || 'N/A',
                    area: areaText || 'N/A', 
                    rooms: rooms || 'N/A',
                    location,
                    link: link ? (link.startsWith('http') ? link : `https://www.imovirtual.com${link}`) : 'N/A',
                    source: 'ImóVirtual'
                };
                
                properties.push(property);
                
                console.log(`✅ Imóvel ${index + 1}:`);
                console.log(`   📋 Título: ${property.title}`);
                console.log(`   💰 Preço: ${property.price}`);
                console.log(`   📐 Área: ${property.area}`);
                console.log(`   🏠 Tipologia: ${property.rooms}`);
                console.log(`   📍 Localização: ${property.location}`);
                console.log(`   🔗 Link: ${property.link}`);
                console.log('');
            } else {
                console.log(`⚠️  Imóvel ${index + 1}: Título insuficiente ou vazio`);
            }
        } catch (error) {
            console.log(`❌ Erro ao processar imóvel ${index + 1}:`, error.message);
        }
    });
    
    console.log(`✅ ImóVirtual processado: ${properties.length} imóveis encontrados`);
    return properties;
}

// Função para normalizar preços e áreas
function normalizeProperty(property) {
    // Normalizar preço
    let price = property.price;
    let priceNum = 0;
    if (typeof price === 'string') {
        const priceMatch = price.match(/(\d+(?:[.,\s]\d+)*)/);
        if (priceMatch) {
            priceNum = parseFloat(priceMatch[1].replace(/[\s.,]/g, ''));
            // Se o número for muito pequeno, pode estar em formato diferente
            if (priceNum < 1000 && price.includes('.')) {
                priceNum = parseFloat(priceMatch[1].replace(/\./g, '').replace(/,/g, '.'));
            }
        }
    }
    
    // Normalizar área
    let area = property.area;
    let areaNum = 0;
    if (typeof area === 'string') {
        const areaMatch = area.match(/(\d+(?:[.,]\d+)?)/);
        if (areaMatch) {
            areaNum = parseFloat(areaMatch[1].replace(',', '.'));
        }
    }
    
    // Calcular preço por m²
    let pricePerM2 = 0;
    if (priceNum > 0 && areaNum > 0) {
        pricePerM2 = Math.round(priceNum / areaNum);
    }
    
    return {
        ...property,
        priceNum,
        areaNum,
        pricePerM2
    };
}

// Main execution
const criteria = extractCriteria(query);
console.log('📋 Critérios extraídos:', criteria);

const imovirtualUrl = buildImovirtualUrl(criteria);
console.log('🌐 Imovirtual:', imovirtualUrl);
console.log('');

console.log('🚀 Iniciando scraping...');

// Array para coletar todos os resultados
const allProperties = [];

const crawler = new CheerioCrawler({
    requestHandler: async ({ request, $ }) => {
        console.log(`\n📊 URL: ${request.loadedUrl}`);
        console.log(`📊 Status: ${request.loadedUrl ? '200' : 'Error'}`);
        
        // Debug: informações sobre a página
        console.log(`📄 Título da página: ${$('title').text()}`);
        console.log(`📄 Tamanho do HTML: ${$.html().length} caracteres`);
        
        // Verificar se a página carregou corretamente
        if ($.html().includes('blocked') || $.html().includes('captcha') || $.html().includes('robot')) {
            console.log('⚠️  Página pode estar bloqueada por anti-bot');
        }
        
        const properties = await scrapeImovirtual($, request.loadedUrl);
        
        // Adicionar propriedades ao array global
        allProperties.push(...properties);
        
        return properties;
    },
    
    // Configurações para evitar bloqueios
    requestHandlerTimeoutSecs: 30,
    navigationTimeoutSecs: 30,
    requestInterceptor: (request) => {
        // Adicionar headers mais realistas
        request.headers = {
            ...request.headers,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'pt-PT,pt;q=0.8,en-US;q=0.5,en;q=0.3',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        };
    },
    
    // Adicionar delay entre requests
    minConcurrency: 1,
    maxConcurrency: 1,
});

try {
    // Executar scraping apenas no Imovirtual
    await crawler.run([imovirtualUrl])
