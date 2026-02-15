export type SemverTuple = [number, number, number];

function parse(version: string): SemverTuple {
    const m = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) throw new Error(`Invalid semver: ${version}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareSemver(aVersion: string, bVersion: string): number {
    const a = parse(aVersion);
    const b = parse(bVersion);
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    if (a[2] !== b[2]) return a[2] < b[2] ? -1 : 1;
    return 0;
}

function testComparator(version: SemverTuple, comp: string): boolean {
    const exact = comp.match(/^(\d+\.\d+\.\d+)$/);
    if (exact) return compareSemver(`${version[0]}.${version[1]}.${version[2]}`, exact[1]) === 0;

    const caret = comp.match(/^\^(\d+\.\d+\.\d+)$/);
    if (caret) {
        const base = parse(caret[1]);
        const upper: SemverTuple = [base[0] + 1, 0, 0];
        return compareSemver(`${version[0]}.${version[1]}.${version[2]}`, `${base[0]}.${base[1]}.${base[2]}`) >= 0
            && compareSemver(`${version[0]}.${version[1]}.${version[2]}`, `${upper[0]}.${upper[1]}.${upper[2]}`) < 0;
    }

    const tilde = comp.match(/^~(\d+\.\d+\.\d+)$/);
    if (tilde) {
        const base = parse(tilde[1]);
        const upper: SemverTuple = [base[0], base[1] + 1, 0];
        return compareSemver(`${version[0]}.${version[1]}.${version[2]}`, `${base[0]}.${base[1]}.${base[2]}`) >= 0
            && compareSemver(`${version[0]}.${version[1]}.${version[2]}`, `${upper[0]}.${upper[1]}.${upper[2]}`) < 0;
    }

    const op = comp.match(/^(<=|>=|<|>)(\d+\.\d+\.\d+)$/);
    if (op) {
        const target = parse(op[2]);
        const c = compareSemver(`${version[0]}.${version[1]}.${version[2]}`, `${target[0]}.${target[1]}.${target[2]}`);
        switch (op[1]) {
            case "<=": return c <= 0;
            case ">=": return c >= 0;
            case "<": return c < 0;
            case ">": return c > 0;
            default: return false;
        }
    }

    return false;
}

export function satisfiesSemver(version: string, range: string): boolean {
    const v = parse(version);
    const normalized = range.trim();
    if (!normalized || normalized === "*" || normalized.toLowerCase() === "latest") return true;

    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return testComparator(v, parts[0]);

    for (const part of parts) {
        if (!testComparator(v, part)) return false;
    }
    return true;
}
