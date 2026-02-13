import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

type envData = {
  username?: string;
  password?: string;
  host?: string;
  port?: string;
  name?: string;
  ssl?: {
    require: boolean;
    rejectUnauthorized: boolean;
    ca: any;
  };
};

const env = process.env.NODE_ENV || 'development';

const development = {
  username: process.env.DB_USER_DEV,
  password: process.env.DB_PASSWORD_DEV,
  host: process.env.DB_HOST_DEV,
  port: process.env.DB_PORT_DEV,
  name: process.env.DB_NAME_DEV,
  ssl: {
    require: true,
    rejectUnauthorized: false,
    ca: fs.readFileSync('src/config/ca.pem')
  }
};

const staging = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  name: process.env.DB_NAME_DEV,
  ssl: {
    require: true,
    rejectUnauthorized: false,
    ca: fs.readFileSync('src/config/ca.pem')
  }
};

const production = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  name: process.env.DB_NAME_DEV,
  ssl: {
    require: true,
    rejectUnauthorized: false,
    ca: fs.readFileSync('src/config/ca.pem')
  }
};

const config: {
  [key: string]: envData;
} = {
  development,
  staging,
  production,
};

export default config[env];
