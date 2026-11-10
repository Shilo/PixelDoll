// Arm S: GET /balance only (no spend). Prints the balance fields, never the key.
import './y_env.mts';
import { api } from './lib.mts';
import { API_BASE } from './y_env.mts';
const b: any = await api!.balance();
console.log(API_BASE.startsWith('http://localhost') ? 'local API' : 'public API', JSON.stringify(b).replace(/"[^"]*key[^"]*":"[^"]*"/gi, ''));
