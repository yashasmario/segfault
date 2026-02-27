export type ChangeKind =
    | 'removed'
    | 'renamed'
    | 'signature_changed'
    | 'behavior_changed'
    | 'import_changed';

export interface BreakingChange {
    kind: ChangeKind;
    symbol: string;
    module?: string;
    oldSignature?: string;
    newSignature?: string;
    description: string;
}

export interface Callsite {
    file: string;
    line: number;
    column: number;
    snippet: string[];
    snippetStartLine: number;
    change: BreakingChange;
    confidence: 'high' | 'medium' | 'low';
}

export interface VersionDelta {
    name: string;
    fromVersion: string;
    toVersion: string;
}

export interface AnalysisResult {
    delta: VersionDelta;
    changes: BreakingChange[];
    callsites: Callsite[];
}
