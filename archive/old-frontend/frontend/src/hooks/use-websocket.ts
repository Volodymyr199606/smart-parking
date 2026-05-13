'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import SockJS from 'sockjs-client';
import { Client, IMessage } from '@stomp/stompjs';

interface UseWebSocketOptions {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: unknown) => void;
    autoReconnect?: boolean;
    reconnectDelay?: number;
}

export function useWebSocket(
    url: string,
    subscriptions: { topic: string; callback: (message: unknown) => void }[],
    options: UseWebSocketOptions = {}
) {
    const [connected, setConnected] = useState(false);
    const stompClient = useRef<Client | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const {
        onConnect,
        onDisconnect,
        onError,
        autoReconnect = true,
        reconnectDelay = 5000,
    } = options;

    const connect = useCallback(() => {
        if (stompClient.current?.active) {
            return;
        }

        const client = new Client({
            webSocketFactory: () => new SockJS(url),
            onConnect: () => {
                setConnected(true);

                // Subscribe to all topics
                interface Subscription {
                    topic: string;
                    callback: (message: IMessage) => void;
                }
                subscriptions.forEach(({ topic, callback }: Subscription) => {
                    client.subscribe(topic, (message: IMessage) => {
                        try {
                            const parsedBody = JSON.parse(message.body);
                            callback(parsedBody);
                        } catch (error) {
                            console.error('Error parsing message:', error);
                        }
                    });
                });

                onConnect?.();
            },
            onDisconnect: () => {
                setConnected(false);
                onDisconnect?.();

                if (autoReconnect) {
                    reconnectTimeoutRef.current = setTimeout(() => {
                        connect();
                    }, reconnectDelay);
                }
            },
            onStompError: (frame) => {
                console.error('STOMP error:', frame);
                onError?.(frame);
            },
        });

        client.activate();
        stompClient.current = client;
    }, [url, subscriptions, onConnect, onDisconnect, onError, autoReconnect, reconnectDelay]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (stompClient.current?.active) {
            stompClient.current.deactivate();
            stompClient.current = null;
        }

        setConnected(false);
    }, []);

    const sendMessage = useCallback((destination: string, body: unknown) => {
        if (stompClient.current?.active) {
            stompClient.current.publish({
                destination,
                body: JSON.stringify(body),
            });
        } else {
            console.error('WebSocket not connected');
        }
    }, []);

    useEffect(() => {
        connect();

        return () => {
            disconnect();
        };
    }, [connect, disconnect]);

    return {
        connected,
        sendMessage,
        connect,
        disconnect,
    };
}