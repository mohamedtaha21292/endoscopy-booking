import { useEffect, useState } from 'react';

export type LocalStatus = { ready: boolean; message: string };

// Standalone build: device-local persistence via localStorage, same keys as the hosted File.
export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void, LocalStatus] {
    const [value, setValue] = useState<T>(initial);
    const [status, setStatus] = useState<LocalStatus>({ ready: false, message: '' });

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(key);
            if (raw != null) setValue(JSON.parse(raw) as T);
            setStatus({ ready: true, message: '' });
        } catch {
            setStatus({ ready: true, message: 'Not saved. Changes last only while this page is open.' });
        }
    }, [key]);

    const set = (v: T) => {
        setValue(v);
        try {
            window.localStorage.setItem(key, JSON.stringify(v));
            setStatus(s => ({ ...s, message: '' }));
        } catch {
            setStatus(s => ({ ...s, message: 'Not saved. Storage is full or blocked on this device.' }));
        }
    };

    return [value, set, status];
}
