import api from './api';

export const registerUser = async (name: string, email: string, password: string) => {
    return api.post('/api/auth/register', { fullName: name, email, password });

};
