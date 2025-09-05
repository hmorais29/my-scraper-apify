// propertyExtractor.js

/**
 * Extrai dados de imóveis das páginas do ImóVirtual
 */
export class PropertyExtractor {

    /**
     * Limpa texto de CSS e artifacts
     */
    static cleanText(text) {
        return text
            .replace(/\.css-[a-zA-Z0-9_-]+[\{\[]/g, ' ')
            .replace(/\d+\s*\/\s*\d+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Extrai tipologia do texto do anúncio
     */
    static extractRooms(text) {
        const cleanText = this.cleanText(text);
        
        console.log(`🏠 A extrair tipologia de: ${cleanText.substring(0, 100)}...`);
        
        // Padrões ordenados por especificidade
        const patterns = [
            /T(\d+)/i,                              // T3, T2, etc.
            /(\d+)\s+quartos/i,                     // "3 quartos"
            /apartamento.*?(\d+)\s*assoalhadas/i    // "apartamento 3 assoalhadas"
        ];
        
        for (const pattern of patterns) {
            const match = cleanText.match(pattern);
            if (match && match[1]) {
                const roomNumber = match[1];
                const rooms = `T${roomNumber}`;
                console.log(`✅ Tipologia encontrada: ${rooms}`);
                return rooms;
            }
        }
        
        console.log('❌ Tipologia não encontrada');
        return '';
    }

    /**
     * Extrai área do texto do anúncio
     */
    static extractArea(text) {
        const cleanText = this.cleanText(text);
        
        console.log(`📐 A extrair área de: ${cleanText.substring(0, 100)}...`);
        
        const areaPatterns = [
            /(\d+(?:[,\.]\d+)?)\s*m[²2]/i,  // "87m²", "87.5 m²"
            /(\d+)\s*m²/i,                  // "87 m²"
            /(\d+(?:[,\.]\d+)?)\s*metros/i  // "87 metros"
        ];
        
        for (const pattern of areaPatterns) {
            const match = cleanText.match(pattern);
            if (match) {
                let area = parseFloat(match[1].replace(',', '.'));
                
                // Validar se a área é realista
                if (area > 20 && area < 1000) {
                    console.log(`✅ Área encontrada: ${Math.round(area)}m²`);
                    return Math.round(area);
                }
            }
        }
        
        console.log('❌ Área não encontrada');
        return 0;
    }

    /**
     * Extrai preço do texto do anúncio
     */
    static extractPrice(text, searchType) {
        const cleanText = this.cleanText(text);
        
        console.log(`💰 A extrair preço (${searchType}) de: ${cleanText.substring(0, 100)}...`);
        
        // Padrões baseados nos dados reais observados
        const pricePatterns = [
            // Formato com espaços: "250 000 €", "480 000 €"
            /(\d{1,3}(?:\s+\d{3})+)\s*€/g,
            // Formato com pontos: "250.000 €"
            /(\d{1,3}(?:\.\d{3})+)\s*€/g,
            // Para arrendamento: números menores
            searchType === 'rent' ? /(\d{3,4})\s*€/g : null,
            // Formato sem separadores: "250000 €"
            /(\d{5,7})\s*€/g
        ].filter(Boolean);
        
        const prices = [];
        
        for (const pattern of pricePatterns) {
            let match;
            pattern.lastIndex = 0; // Reset regex
            
            while ((match = pattern.exec(cleanText)) !== null) {
                let priceStr = match[1].replace(/\s+/g, '').replace(/\./g, '');
                let price = parseInt(priceStr);
                
                // Validar range de preços
                let isValid;
                if (searchType === 'rent') {
                    isValid = price >= 200 && price <= 5000;
                } else {
                    isValid = price >= 50000 && price <= 5000000;
                }
                
                if (isValid) {
                    prices.push(price);
                    console.log(`✅ Preço válido encontrado: ${price.toLocaleString()}€`);
                }
            }
        }
        
        if (prices.length > 0) {
            // Para venda, pegar o maior; para arrendamento, o menor
            const finalPrice = searchType === 'rent' ? Math.min(...prices) : Math.max(...prices);
            console.log(`🎯 Preço final: ${finalPrice.toLocaleString()}€`);
            return finalPrice;
        }
        
        console.log('❌ Preço não encontrado');
        return 0;
    }

    /**
     * Extrai título do anúncio
     */
    static extractTitle(element, fallbackText = '') {
        const titleSelectors = [
            '[data-cy="listing-item-title"]',
            'h2', 'h3', 'h4',
            '[class*="title"]',
            'p'
        ];
        
        for (const selector of titleSelectors) {
            const titleEl = element.find(selector).first();
            const title = titleEl.text().trim();
            
            if (title && title.length > 10 && !title.includes('css-')) {
                console.log(`📋 Título encontrado: ${title.substring(0, 60)}...`);
                return title;
            }
        }
        
        // Fallback para texto genérico
        const genericTitle = fallbackText || 'Imóvel disponível';
        console.log(`📋 Usando título genérico: ${genericTitle}`);
        return genericTitle;
    }

    /**
     * Extrai link do anúncio
     */
    static extractLink(element) {
        const linkSelectors = [
            '[data-cy="listing-item-link"]',
            'a[href*="/anuncio/"]',
            'a[href*="ID"]',
            'a[href]'
        ];
        
        for (const selector of linkSelectors) {
            const linkEl = element.find(selector).first();
            let link = linkEl.attr('href') || '';
            
            if (link && (link.includes('anuncio') || link.includes('ID'))) {
                if (!link.startsWith('http')) {
                    link = 'https://www.imovirtual.com' + link;
                }
                console.log(`🔗 Link encontrado: ${link.substring(0, 80)}...`);
                return link;
            }
        }
        
        console.log('❌ Link não encontrado');
        return '';
    }

    /**
     * Valida se um imóvel extraído é válido
     */
    static validateProperty(property, searchType) {
        const validations = {
            hasTitle: property.title && property.title.length > 10,
            hasLink: property.link && property.link.includes('imovirtual'),
            hasValidPrice: property.price > 0,
            priceInRange: false
        };
        
        // Validar range de preço
        if (searchType === 'rent') {
            validations.priceInRange = property.price >= 200 && property.price <= 5000;
        } else {
            validations.priceInRange = property.price >= 25000 && property.price <= 3000000;
        }
        
        const isValid = Object.values(validations).every(Boolean);
        
        console.log(`🔍 Validação do imóvel:`, validations);
        console.log(`✅ Imóvel ${isValid ? 'válido' : 'inválido'}`);
        
        return { isValid, validations };
    }

    /**
     * Processa um elemento de anúncio completo
     */
    static processListingElement(element, searchParams, index) {
        console.log(`\n--- PROCESSANDO ANÚNCIO ${index + 1} ---`);
        
        const rawText = element.text();
        const { searchType, rooms: searchRooms, locations } = searchParams;
        
        // Extrair dados básicos
        const title = this.extractTitle(element, `Imóvel para ${searchType === 'rent' ? 'arrendamento' : 'venda'}`);
        const link = this.extractLink(element);
        const price = this.extractPrice(rawText, searchType);
        const area = this.extractArea(rawText);
        const actualRooms = this.extractRooms(rawText) || searchRooms || '';
        
        // Construir objeto do imóvel
        const property = {
            title: title.substring(0, 200),
            price: price,
            area: area,
            rooms: actualRooms,
            location: locations && locations.length > 0 ? locations[0] : '',
            pricePerSqm: area > 0 ? Math.round(price / area) : 0,
            link: link,
            site: 'ImóVirtual',
            searchQuery: searchParams.originalQuery || '',
            searchType: searchType,
            condition: searchParams.condition,
            propertyIndex: index + 1,
            
            // Campos formatados para apresentação
            priceFormatted: `${price.toLocaleString()} €`,
            areaFormatted: area > 0 ? `${area} m²` : 'N/A',
            pricePerSqmFormatted: area > 0 ? `${Math.round(price / area).toLocaleString()} €/m²` : 'N/A',
            
            timestamp: new Date().toISOString()
        };
        
        // Validar propriedade
        const validation = this.validateProperty(property, searchType);
        
        // Log detalhado
        console.log(`📋 Título: ${property.title.substring(0, 50)}...`);
        console.log(`💰 Preço: ${property.priceFormatted}`);
        console.log(`📐 Área: ${property.areaFormatted}`);
        console.log(`🏠 Tipologia: ${property.rooms}`);
        console.log(`🔗 Link: ${property.link ? 'Sim' : 'Não'}`);
        
        return {
            property: property,
            isValid: validation.isValid,
            validations: validation.validations
        };
    }

    /**
     * Calcula estatísticas dos resultados extraídos
     */
    static calculateStats(results) {
        if (results.length === 0) return {};
        
        const prices = results.map(r => r.price).filter(p => p > 0);
        const areas = results.map(r => r.area).filter(a => a > 0);
        const pricesPerSqm = results.map(r => r.pricePerSqm).filter(p => p > 0);
        
        const stats = {
            total: results.length,
            withPrice: prices.length,
            withArea: areas.length,
            priceStats: prices.length > 0 ? {
                min: Math.min(...prices),
                max: Math.max(...prices),
                avg: Math.round(prices.reduce((a, b) => a + b) / prices.length)
            } : null,
            areaStats: areas.length > 0 ? {
                min: Math.min(...areas),
                max: Math.max(...areas),
                avg: Math.round(areas.reduce((a, b) => a + b) / areas.length)
            } : null,
            pricePerSqmStats: pricesPerSqm.length > 0 ? {
                min: Math.min(...pricesPerSqm),
                max: Math.max(...pricesPerSqm),
                avg: Math.round(pricesPerSqm.reduce((a, b) => a + b) / pricesPerSqm.length)
            } : null
        };
        
        console.log('📊 Estatísticas dos resultados:', stats);
        return stats;
    }
}
