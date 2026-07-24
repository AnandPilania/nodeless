import { useCallback, useEffect, useState } from "react";

function readStorage<T>(key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return fallback;
        return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
    } catch {
        return fallback;
    }
}

function writeStorage<T>(key: string, value: T): void {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // storage unavailable (private mode, quota exceeded) - fail silently, layout just won't persist
    }
}

export function usePersistentState<T extends object>(
    key: string,
    defaultValue: T
): [T, (updater: T | ((prev: T) => T)) => void, () => void] {
    const [state, setState] = useState<T>(() => readStorage(key, defaultValue));

    useEffect(() => {
        writeStorage(key, state);
    }, [key, state]);

    const update = useCallback(
        (updater: T | ((prev: T) => T)) => {
            setState((prev) => (typeof updater === "function" ? (updater as (prev: T) => T)(prev) : updater));
        },
        []
    );

    const reset = useCallback(() => {
        setState(defaultValue);
        try {
            window.localStorage.removeItem(key);
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return [state, update, reset];
}
