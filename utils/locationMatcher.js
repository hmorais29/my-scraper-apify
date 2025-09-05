// locationMatcher.js

/**
 * Sistema avançado de matching de localizações
 */
export class LocationMatcher {

    /**
     * Normaliza texto para comparação
     */
    static normalizeText(text) {
        return text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Calcula distância de Levenshtein para fuzzy matching
     */
    static levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * Encontra a melhor localização para uma query
     */
    static findBestMatch(locationQueries, locationsData) {
        console.log(`🔍 A procurar melhor match para: [${locationQueries.join(', ')}]`);

        // Preparar dados de localizações
        let allLocationArrays = {};
        
        if (locationsData.districts && locationsData.councils) {
            allLocationArrays = locationsData;
        } else if (Array.isArray(locationsData) && locationsData.length > 0) {
            const consolidatedData = locationsData.find(item => item.type === 'FINAL_CONSOLIDATED_DATA');
            if (consolidatedData) {
                allLocationArrays = consolidatedData;
            } else {
                console.log('❌ Dados de localização inválidos');
                return null;
            }
        } else {
            console.log('❌ Estrutura de dados de localização não reconhecida');
            return null;
        }

        // Criar lista unificada com prioridades
        const allLocations = [
            ...allLocationArrays.neighborhoods?.map(n => ({...n, priority: 5, type: 'neighborhood'})) || [],
            ...allLocationArrays.parishes?.map(p => ({...p, priority: 4, type: 'parish'})) || [],
            ...allLocationArrays.councils?.map(c => ({...c, priority: 3, type: 'council'})) || [],
            ...allLocationArrays.districts?.map(d => ({...d, priority: 2, type: 'district'})) || []
        ];

        console.log(`📊 Total de localizações disponíveis: ${allLocations.length}`);

        let bestMatch = null;
        let bestScore = 0;

        // Para cada query de localização
        for (const locationQuery of locationQueries) {
            const normalizedQuery = this.normalizeText(locationQuery);
            
            console.log(`🔍 A processar: "${normalizedQuery}"`);

            // Para cada localização disponível
            for (const location of allLocations) {
                const normalizedName = this.normalizeText(location.name);
                const normalizedFullName = this.normalizeText(location.fullName || '');

                let score = 0;

                // 1. Match exato (prioridade máxima)
                if (normalizedName === normalizedQuery) {
                    score = 1000 * location.priority;
                    console.log(`🎯 Match exato: ${location.name} (score: ${score})`);
                }
                // 2. Query contém o nome da localização
                else if (normalizedQuery.includes(normalizedName)) {
                    score = 800 * location.priority * (normalizedName.length / normalizedQuery.length);
                    console.log(`🎯 Query contém nome: ${location.name} (score: ${score})`);
                }
                // 3. Nome da localização contém a query
                else if (normalizedName.includes(normalizedQuery)) {
                    score = 600 * location.priority * (normalizedQuery.length / normalizedName.length);
                    console.log(`🎯 Nome contém query: ${location.name} (score: ${score})`);
                }
                // 4. Match no fullName
                else if (normalizedFullName.includes(normalizedQuery)) {
                    score = 400 * location.priority;
                    console.log(`🎯 Match no fullName: ${location.name} (score: ${score})`);
                }
                // 5. Fuzzy matching para typos
                else {
                    const distance = this.levenshteinDistance(normalizedName, normalizedQuery);
                    const similarity = 1 - (distance / Math.max(normalizedName.length, normalizedQuery.length));
                    
                    if (similarity > 0.7) { // 70% de similaridade
                        score = 200 * location.priority * similarity;
                        console.log(`🎯 Fuzzy match: ${location.name} (similaridade: ${(similarity * 100).toFixed(1)}%, score: ${score})`);
                    }
                }

                // Bonus para matches múltiplos (quando a query tem várias localizações)
                if (score > 0 && locationQueries.length > 1) {
                    // Verificar se outras partes da query também matcham com parents
                    for (const otherQuery of locationQueries) {
                        if (otherQuery !== locationQuery) {
                            const otherNormalized = this.normalizeText(otherQuery);
                            if (normalizedFullName.includes(otherNormalized)) {
                                score *= 1.5; // Bonus de 50%
                                console.log(`🎯 Bonus multi-match: ${location.name}`);
                                break;
                            }
                        }
                    }
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = location;
                }
            }
        }

        if (bestMatch) {
            console.log(`✅ Melhor match: ${bestMatch.name} (${bestMatch.type}) - Score: ${bestScore}`);
            console.log(`📍 FullName: ${bestMatch.fullName}`);
            console.log(`🆔 ID: ${bestMatch.id}`);
            return bestMatch;
        }

        console.log('❌ Nenhuma localização encontrada');
        return null;
    }

    /**
     * Encontra matches alternativos se o principal falhar
     */
    static findAlternativeMatches(locationQueries, locationsData, limit = 3) {
        console.log(`🔍 A procurar matches alternativos...`);

        // Similar à função principal mas retorna múltiplos resultados
        let allLocationArrays = {};
        
        if (locationsData.districts && locationsData.councils) {
            allLocationArrays = locationsData;
        } else if (Array.isArray(locationsData) && locationsData.length > 0) {
            const consolidatedData = locationsData.find(item => item.type === 'FINAL_CONSOLIDATED_DATA');
            if (consolidatedData) {
                allLocationArrays = consolidatedData;
            } else {
                return [];
            }
        } else {
            return [];
        }

        const allLocations = [
            ...allLocationArrays.neighborhoods?.map(n => ({...n, priority: 5, type: 'neighborhood'})) || [],
            ...allLocationArrays.parishes?.map(p => ({...p, priority: 4, type: 'parish'})) || [],
            ...allLocationArrays.councils?.map(c => ({...c, priority: 3, type: 'council'})) || [],
            ...allLocationArrays.districts?.map(d => ({...d, priority: 2, type: 'district'})) || []
        ];

        const matches = [];

        for (const locationQuery of locationQueries) {
            const normalizedQuery = this.normalizeText(locationQuery);

            for (const location of allLocations) {
                const normalizedName = this.normalizeText(location.name);
                const normalizedFullName = this.normalizeText(location.fullName || '');

                let score = 0;

                if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
                    score = location.priority * 100;
                } else if (normalizedFullName.includes(normalizedQuery)) {
                    score = location.priority * 50;
                }

                if (score > 0) {
                    matches.push({ location, score });
                }
            }
        }

        // Ordenar por score e remover duplicados
        const uniqueMatches = Array.from(
            new Map(matches.map(m => [m.location.id, m])).values()
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(m => m.location);

        console.log(`📋 ${uniqueMatches.length} matches alternativos encontrados`);
        return uniqueMatches;
    }
}
