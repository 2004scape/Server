import WordEncBadWords from '#lostcity/cache/WordEncBadWords.js';
import WordEncDomains from '#lostcity/cache/WordEncDomains.js';
import WordEnc from '#lostcity/cache/WordEnc.js';

export default class WordEncTlds {
    private readonly wordEncBadWords: WordEncBadWords;
    private readonly wordEncDomains: WordEncDomains;

    readonly tlds: Uint16Array[] = [];
    readonly tldTypes: number[] = [];

    constructor(wordEncBadWords: WordEncBadWords, wordEncDomains: WordEncDomains) {
        this.wordEncBadWords = wordEncBadWords;
        this.wordEncDomains = wordEncDomains;
    }

    filter(chars: string[]): void {
        const period: string[] = [...chars];
        this.wordEncBadWords.filterBadCombinations(null, period, WordEnc.PERIOD);
        const slash: string[] = [...chars];
        this.wordEncBadWords.filterBadCombinations(null, slash, WordEnc.SLASH);
        for (let index = 0; index < this.tlds.length; index++) {
            this.filterTld(slash, this.tldTypes[index], chars, this.tlds[index], period);
        }
    }

    private filterTld(slash: string[], tldType: number, chars: string[], tld: Uint16Array, period: string[]): void {
        if (tld.length > chars.length) {
            return;
        }
        for (let startIndex = 0; startIndex <= chars.length - tld.length; startIndex++) {
            let currentIndex = startIndex;
            let tldIndex = 0;
            const { currentIndex: updatedIndex, tldIndex: updatedTldIndex } = this.processTlds(chars, tld, currentIndex, tldIndex);
            currentIndex = updatedIndex;
            tldIndex = updatedTldIndex;
            if (tldIndex < tld.length) {
                continue;
            }
            let shouldFilter = false;
            const periodFilterStatus = WordEnc.prefixSymbolStatus(startIndex, chars, 3, period, [',', '.']);
            const slashFilterStatus = WordEnc.suffixSymbolStatus(currentIndex - 1, chars, 5, slash, ['\\', '/']);
            if (tldType == 1 && periodFilterStatus > 0 && slashFilterStatus > 0) {
                shouldFilter = true;
            }
            if (tldType == 2 && (periodFilterStatus > 2 && slashFilterStatus > 0 || periodFilterStatus > 0 && slashFilterStatus > 2)) {
                shouldFilter = true;
            }
            if (tldType == 3 && periodFilterStatus > 0 && slashFilterStatus > 2) {
                shouldFilter = true;
            }
            if (!shouldFilter) {
                continue;
            }
            let startFilterIndex = startIndex;
            let endFilterIndex = currentIndex - 1;
            let foundPeriod = false;
            let periodIndex;
            if (periodFilterStatus > 2) {
                if (periodFilterStatus == 4) {
                    foundPeriod = false;
                    for (periodIndex = startIndex - 1; periodIndex >= 0; periodIndex--) {
                        if (foundPeriod) {
                            if (period[periodIndex] != '*') {
                                break;
                            }
                            startFilterIndex = periodIndex;
                        } else if (period[periodIndex] == '*') {
                            startFilterIndex = periodIndex;
                            foundPeriod = true;
                        }
                    }
                }
                foundPeriod = false;
                for (periodIndex = startFilterIndex - 1; periodIndex >= 0; periodIndex--) {
                    if (foundPeriod) {
                        if (WordEnc.isSymbol(chars[periodIndex])) {
                            break;
                        }
                        startFilterIndex = periodIndex;
                    } else if (!WordEnc.isSymbol(chars[periodIndex])) {
                        foundPeriod = true;
                        startFilterIndex = periodIndex;
                    }
                }
            }
            if (slashFilterStatus > 2) {
                if (slashFilterStatus == 4) {
                    foundPeriod = false;
                    for (periodIndex = endFilterIndex + 1; periodIndex < chars.length; periodIndex++) {
                        if (foundPeriod) {
                            if (slash[periodIndex] != '*') {
                                break;
                            }
                            endFilterIndex = periodIndex;
                        } else if (slash[periodIndex] == '*') {
                            endFilterIndex = periodIndex;
                            foundPeriod = true;
                        }
                    }
                }
                foundPeriod = false;
                for (periodIndex = endFilterIndex + 1; periodIndex < chars.length; periodIndex++) {
                    if (foundPeriod) {
                        if (WordEnc.isSymbol(chars[periodIndex])) {
                            break;
                        }
                        endFilterIndex = periodIndex;
                    } else if (!WordEnc.isSymbol(chars[periodIndex])) {
                        foundPeriod = true;
                        endFilterIndex = periodIndex;
                    }
                }
            }
            WordEnc.maskChars(startFilterIndex, endFilterIndex + 1, chars);
        }
    }

    private processTlds(chars: string[], tld: Uint16Array, currentIndex: number, tldIndex: number): { currentIndex: number, tldIndex: number } {
        while (currentIndex < chars.length && tldIndex < tld.length) {
            const currentChar = chars[currentIndex];
            const nextChar = (currentIndex + 1 < chars.length) ? chars[currentIndex + 1] : '\u0000';
            let currentLength: number;

            if ((currentLength = this.wordEncDomains.getEmulatedDomainCharLen(nextChar, String.fromCharCode(tld[tldIndex]), currentChar)) > 0) {
                currentIndex += currentLength;
                tldIndex++;
            } else {
                if (tldIndex === 0) {
                    break;
                }
                let previousLength: number;
                if ((previousLength = this.wordEncDomains.getEmulatedDomainCharLen(nextChar, String.fromCharCode(tld[tldIndex - 1]), currentChar)) > 0) {
                    currentIndex += previousLength;
                } else {
                    if (!WordEnc.isSymbol(currentChar)) {
                        break;
                    }
                    currentIndex++;
                }
            }
        }
        return { currentIndex, tldIndex };
    }
}
