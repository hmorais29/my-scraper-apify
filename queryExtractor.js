// queryExtractor.js

/**
 * Extrai informações básicas da query de pesquisa
 */
export class QueryExtractor {
    
    /**
     * Detecta se é arrendamento ou compra/venda
     */
    static detectSearchType(query) {
        const rentKeywords = /arrendamento|arrendar|alugar|rent|rental/i;
        const isRent = rentKeywords.test(query);
        
        console.log(`🎯 Tipo detectado: ${isRent ? 'ARRENDAMENTO' : 'COMPRA/VENDA'}`);
        return isRent ? 'rent' : 'buy';
    }

    /**
     * Detecta estado do imóvel (novo, usado, renovado)
     */
    static detectPropertyCondition(query) {
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

    /**
     * Extrai tipologia (T1, T2, T3, etc.)
     */
    static extractRooms(query) {
        const roomsMatch = query.match(/T(\d+)/i);
        const rooms = roomsMatch ? roomsMatch[0].toUpperCase() : '';
        
        console.log(`🏠 Tipologia: ${rooms || 'não especificada'}`);
        return rooms;
    }

    /**
     * Extrai múltiplas localizações da query usando regex melhorado
     * CORRIGIDO: Filtra preços e palavras irrelevantes
     */
    static extractLocations(query) {
        // Normalizar query
        const normalized = query.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[,;]/g, ' ') // Separadores
            .replace(/\s+/g, ' ')
            .trim();

        console.log(`🔍 Query normalizada: "${normalized}"`);

        // Padrões de localização melhorados
        const locationPatterns = [
            // Localizações compostas - mais específicas primeiro
            /santo ant[oô]nio dos cavaleiros/i,
            /caldas da rainha/i,
            /vila nova de gaia/i,
            /santa maria da feira/i,
            /s[aã]o jo[aã]o da madeira/i,
            /camarate[,\s]+unhos[,\s]*e[,\s]*apelacao/i,
            /unhos[,\s]*e[,\s]*apelacao/i,
            
            // Localizações individuais - ordem por especificidade
            /apelacao|apelaçao/i,
            /unhos/i,
            /camarate/i,
            /loures/i,
            /lisboa/i,
            /porto/i,
            /coimbra/i,
            /braga/i,
            /sintra/i,
            /cascais/i,
            /almada/i,
            /amadora/i,
            /setúbal/i,
            /aveiro/i
        ];

        const foundLocations = [];
        const processedText = normalized;

        for (const pattern of locationPatterns) {
            const matches = [...processedText.matchAll(new RegExp(pattern.source, 'gi'))];
            for (const match of matches) {
                const location = match[0].toLowerCase();
                if (!foundLocations.includes(location)) {
                    foundLocations.push(location);
                    console.log(`📍 Localização encontrada (padrão): "${location}"`);
                }
            }
        }

        // Se não encontrou nada específico, extrair palavras candidatas
        if (foundLocations.length === 0) {
            const words = normalized.split(' ').filter(word => {
                // CORRIGIDO: Filtrar preços, números, e palavras irrelevantes
                const isPricePattern = /^\d+k$/i.test(word) || /^\d{3,}$/i.test(word) || word.includes('€');
                const isIrrelevant = ['com', 'por', 'para', 'apartamento', 'casa', 'em', 'de', 'da', 'do', 'dos', 'das'].includes(word);
                const isTooShort = word.length <= 3;
                
                const shouldExclude = isPricePattern || isIrrelevant || isTooShort;
                
                if (shouldExclude) {
                    console.log(`❌ Palavra filtrada: "${word}" (${isPricePattern ? 'preço' : isIrrelevant ? 'irrelevante' : 'muito curta'})`);
                }
                
                return !shouldExclude;
            });
            
            console.log(`🔍 Palavras candidatas (filtradas): ${words.join(', ')}`);
            return words;
        }

        return foundLocations;
    }

    /**
     * Extrai preço da query (se especificado) - APENAS para referência, NÃO para limitar pesquisa
     */
    static extractPriceRange(query) {
        const pricePatterns = [
            /por\s+(\d+)k/i,
            /(\d+)k\s*€/i,
            /(\d{3,6})\s*€/i,
            /até\s+(\d+)/i,
            /max[íi]mo\s+(\d+)/i
        ];

        for (const pattern of pricePatterns) {
            const match = query.match(pattern);
            if (match) {
                let price = parseInt(match[1]);
                if (query.includes('k') || query.includes('K')) {
                    price *= 1000;
                }
                
                console.log(`💰 Preço extraído (APENAS para referência): ${price.toLocaleString()}€`);
                console.log(`⚠️  NOTA: Preço NÃO será usado para limitar a pesquisa`);
                
                // Retornar apenas para referência, não para usar no filtro
                return { reference: price, note: 'Para comparação posterior, não para filtrar' };
            }
        }

        return null;
    }

    /**
     * Extrai área da query (se especificada)
     */
    static extractArea(query) {
        const areaPatterns = [
            /com\s+(\d+)m[²2]/i,
            /(\d+)\s*m[²2]/i,
            /(\d+)\s*metros/i
        ];

        for (const pattern of areaPatterns) {
            const match = query.match(pattern);
            if (match) {
                const area = parseInt(match[1]);
                console.log(`📐 Área extraída: ${area}m²`);
                return area;
            }
        }

        return null;
    }

    /**
     * Função principal que extrai tudo
     */
    static extractAll(query) {
        console.log(`🔍 A analisar query: "${query}"`);

        const result = {
            originalQuery: query,
            searchType: this.detectSearchType(query),
            condition: this.detectPropertyCondition(query),
            rooms: this.extractRooms(query),
            locations: this.extractLocations(query),
            priceRange: this.extractPriceRange(query),
            area: this.extractArea(query),
            timestamp: new Date().toISOString()
        };

        console.log('📋 Extração completa:', result);
        return result;
    }
}
