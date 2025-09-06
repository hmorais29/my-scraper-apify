// queryExtractor.js - VERSÃO CORRIGIDA

/**
 * Extrai informações básicas da query de pesquisa
 * CORRIGIDO: Melhor detecção de localizações compostas
 */
export class QueryExtractor {
    
    /**
     * Detecta se é arrendamento ou compra/venda
     */
    static detectSearchType(query) {
        const rentKeywords = /arrendamento|arrendar|mensal|mensalidade|alugar|rent|rental|por\s+mês|\/mês|mensais?|renda/i;
        const isRent = rentKeywords.test(query);
        
        console.log(`🎯 Tipo detectado: ${isRent ? 'ARRENDAMENTO' : 'COMPRA/VENDA'}`);
        return isRent ? 'rent' : 'buy';
    }

    /**
     * Detecta estado do imóvel (novo, usado, renovado)
     */
    static detectPropertyCondition(query) {
        const newKeywords = /novo|novos|nova|novas|construção nova|obra nova/i;
        const usedKeywords = /usado|usados|usada|bom estado|usadas|segunda mão/i;
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
     * CORRIGIDO: Extrai localizações com melhor reconhecimento de nomes compostos
     */
    static extractLocations(query) {
        console.log(`\n🔍 === EXTRAÇÃO DE LOCALIZAÇÕES ===`);
        console.log(`📝 Query original: "${query}"`);

        // Normalizar query preservando estrutura
        const normalized = query.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[,;]/g, ' ') // Separadores
            .replace(/\s+/g, ' ')
            .trim();

        console.log(`🔄 Query normalizada: "${normalized}"`);

        // PADRÕES ESPECÍFICOS DE LOCALIZAÇÕES COMPOSTAS (ordem por especificidade)
        const specificLocationPatterns = [
            // Localizações muito específicas com múltiplas palavras
            {
                pattern: /santo\s+ant[oô]nio\s+dos\s+cavaleiros/gi,
                name: 'Santo António dos Cavaleiros',
                priority: 100
            },
            {
                pattern: /caldas\s+da\s+rainha/gi,
                name: 'Caldas da Rainha',
                priority: 90
            },
            {
                pattern: /vila\s+nova\s+de\s+gaia/gi,
                name: 'Vila Nova de Gaia',
                priority: 90
            },
            {
                pattern: /santa\s+maria\s+da\s+feira/gi,
                name: 'Santa Maria da Feira',
                priority: 90
            },
            {
                pattern: /s[aã]o\s+jo[aã]o\s+da\s+madeira/gi,
                name: 'São João da Madeira',
                priority: 90
            },
            {
                pattern: /santo\s+ant[oô]nio\s+dos\s+cavaleiros\s+e\s+frielas/gi,
                name: 'Santo António dos Cavaleiros e Frielas',
                priority: 80
            },
            {
                pattern: /camarate[,\s]+unhos[,\s]*e[,\s]*apelacao/gi,
                name: 'Camarate, Unhos e Apelação',
                priority: 80
            },
            {
                pattern: /unhos[,\s]*e[,\s]*apelacao/gi,
                name: 'Unhos e Apelação',
                priority: 80
            }
        ];

        const foundLocations = [];

        // 1. PRIMEIRO: Procurar padrões específicos
        console.log(`\n🎯 Fase 1: Procurar padrões específicos...`);
        
        for (const locationPattern of specificLocationPatterns) {
            const matches = [...normalized.matchAll(locationPattern.pattern)];
            for (const match of matches) {
                const location = locationPattern.name;
                if (!foundLocations.some(loc => loc.toLowerCase() === location.toLowerCase())) {
                    foundLocations.push(location);
                    console.log(`✅ Localização específica encontrada: "${location}" (prioridade: ${locationPattern.priority})`);
                }
            }
        }

        // 2. SEGUNDO: Se não encontrou nada específico, procurar padrões genéricos
        if (foundLocations.length === 0) {
            console.log(`\n🔍 Fase 2: Procurar padrões genéricos...`);
            
            const genericLocationPatterns = [
                // Localizações individuais conhecidas
                /apelacao|apelaçao/gi,
                /frielas/gi,
                /unhos/gi,
                /camarate/gi,
                /loures/gi,
                /odivelas/gi,
                /amadora/gi,
                /sintra/gi,
                /cascais/gi,
                /oeiras/gi,
                /lisboa/gi,
                /porto/gi,
                /coimbra/gi,
                /braga/gi,
                /aveiro/gi,
                /faro/gi,
                /evora|évora/gi,
                /beja/gi,
                /setubal|setúbal/gi,
                /santarem|santarém/gi,
                /leiria/gi,
                /viseu/gi,
                /guarda/gi,
                /castelo\s+branco/gi,
                /portalegre/gi,
                /braganca|bragança/gi,
                /vila\s+real/gi,
                /viana\s+do\s+castelo/gi
            ];

            for (const pattern of genericLocationPatterns) {
                const matches = [...normalized.matchAll(pattern)];
                for (const match of matches) {
                    const location = match[0].toLowerCase();
                    if (!foundLocations.includes(location)) {
                        foundLocations.push(location);
                        console.log(`📍 Localização genérica encontrada: "${location}"`);
                    }
                }
            }
        }

        // 3. TERCEIRO: Se ainda não encontrou, extrair palavras candidatas (filtradas)
        if (foundLocations.length === 0) {
            console.log(`\n🔍 Fase 3: Extrair palavras candidatas...`);
            
            const words = normalized.split(' ').filter(word => {
                // Filtrar preços, números, e palavras irrelevantes
                const isPricePattern = /^\d+k$/i.test(word) || /^\d{3,}$/i.test(word) || word.includes('€');
                const isPropertyType = /apartamento|casa|moradia|t\d+|quarto|quartos/i.test(word);
                const isIrrelevant = [
                    'com', 'por', 'para', 'em', 'de', 'da', 'do', 'dos', 'das', 'na', 'no', 'nos', 'nas',
                    'arrendamento', 'arrendar', 'comprar', 'venda', 'vender', 'alugar',
                    'novo', 'novos', 'nova', 'novas', 'usado', 'usados', 'usada', 'usadas'
                ].includes(word);
                const isTooShort = word.length <= 2;
                
                const shouldExclude = isPricePattern || isPropertyType || isIrrelevant || isTooShort;
                
                if (shouldExclude) {
                    console.log(`❌ Palavra filtrada: "${word}" (${
                        isPricePattern ? 'preço' : 
                        isPropertyType ? 'tipo imóvel' : 
                        isIrrelevant ? 'irrelevante' : 'muito curta'
                    })`);
                }
                
                return !shouldExclude;
            });
            
            console.log(`🔍 Palavras candidatas (filtradas): [${words.join(', ')}]`);
            return words.length > 0 ? words : [];
        }

        console.log(`\n✅ === RESULTADO DA EXTRAÇÃO ===`);
        console.log(`📍 Localizações encontradas: [${foundLocations.join(', ')}]`);
        console.log(`🎯 Total: ${foundLocations.length}`);

        return foundLocations;
    }

    /**
     * Extrai preço da query (se especificado) - APENAS para referência
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
     * CORRIGIDA: Função principal que extrai tudo
     */
    static extractAll(query) {
        console.log(`\n🔍 === ANÁLISE DA QUERY ===`);
        console.log(`📝 Query: "${query}"`);

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

        console.log(`\n📋 === RESULTADO DA EXTRAÇÃO ===`);
        console.log(`🎯 Tipo: ${result.searchType}`);
        console.log(`🏠 Tipologia: ${result.rooms || 'N/A'}`);
        console.log(`📍 Localizações: [${result.locations.join(', ')}]`);
        console.log(`🏗️ Condição: ${result.condition || 'N/A'}`);
        console.log(`💰 Preço: ${result.priceRange ? result.priceRange.reference.toLocaleString() + '€ (ref)' : 'N/A'}`);
        console.log(`📐 Área: ${result.area ? result.area + 'm²' : 'N/A'}`);

        return result;
    }

    /**
     * NOVA: Função para testar extração de uma localização específica
     */
    static testLocationExtraction(query, expectedLocation) {
        console.log(`\n🧪 === TESTE DE EXTRAÇÃO ===`);
        console.log(`📝 Query: "${query}"`);
        console.log(`🎯 Localização esperada: "${expectedLocation}"`);

        const locations = this.extractLocations(query);
        const found = locations.some(loc => 
            loc.toLowerCase().includes(expectedLocation.toLowerCase()) ||
            expectedLocation.toLowerCase().includes(loc.toLowerCase())
        );

        console.log(`✅ Resultado: ${found ? 'SUCESSO' : 'FALHOU'}`);
        console.log(`📍 Localizações encontradas: [${locations.join(', ')}]`);

        return { found, locations, expected: expectedLocation };
    }

    /**
     * NOVA: Função helper para debug de queries complexas
     */
    static debugQuery(query) {
        console.log(`\n🐛 === DEBUG DETALHADO ===`);
        console.log(`📝 Query original: "${query}"`);
        
        // Mostrar cada passo da normalização
        const step1 = query.toLowerCase();
        console.log(`1. Lowercase: "${step1}"`);
        
        const step2 = step1.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        console.log(`2. Remove acentos: "${step2}"`);
        
        const step3 = step2.replace(/[,;]/g, ' ');
        console.log(`3. Replace separadores: "${step3}"`);
        
        const step4 = step3.replace(/\s+/g, ' ').trim();
        console.log(`4. Normalize espaços: "${step4}"`);
        
        // Mostrar palavras individuais
        const words = step4.split(' ');
        console.log(`5. Palavras: [${words.join(', ')}]`);
        
        // Testar cada padrão específico
        console.log(`\n6. Teste de padrões específicos:`);
        const patterns = [
            { name: 'Santo António dos Cavaleiros', pattern: /santo\s+ant[oô]nio\s+dos\s+cavaleiros/gi },
            { name: 'Caldas da Rainha', pattern: /caldas\s+da\s+rainha/gi },
            { name: 'Vila Nova de Gaia', pattern: /vila\s+nova\s+de\s+gaia/gi }
        ];
        
        patterns.forEach(p => {
            const matches = [...step4.matchAll(p.pattern)];
            console.log(`   - ${p.name}: ${matches.length > 0 ? '✅ MATCH' : '❌ NO MATCH'}`);
        });
        
        return this.extractAll(query);
    }
}

