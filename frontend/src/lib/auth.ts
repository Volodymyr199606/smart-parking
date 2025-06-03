import api from './api';

export const registerUser = async (name: string, email: string, password: string) => {
    return api.post('/auth/register', { fullName: name, email, password });

};
