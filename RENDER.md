# Deploying to Render

This guide explains how to deploy the Polycentral backend to Render.

## Prerequisites

1. A Render account (https://render.com)
2. A PostgreSQL database instance

## Setup Instructions

### 1. Create a Web Service on Render

1. Go to your Render dashboard
2. Click "New" → "Web Service"
3. Connect your GitHub repository or use the existing one
4. Set the following configuration:
   - **Name**: polycentral-backend
   - **Region**: Choose your preferred region
   - **Branch**: main (or your deployment branch)
   - **Root Directory**: backend
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 2. Configure Environment Variables

In your Render web service settings, add the following environment variables:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `JWT_SECRET` | A secure random string (at least 32 characters) |
| `JWT_REFRESH_SECRET` | Another secure random string (at least 32 characters) |
| `DATABASE_URL` | Your PostgreSQL connection string |
| `CORS_ORIGIN` | Your frontend URL (e.g., https://your-frontend.onrender.com) |
| `FRONTEND_URL` | Your frontend URL (e.g., https://your-frontend.onrender.com) |

### 3. PostgreSQL Database Setup

1. Create a new PostgreSQL database on Render:
   - Go to your Render dashboard
   - Click "New" → "PostgreSQL"
   - Choose a name (e.g., polycentral-db)
   - Select your preferred region
   - Click "Create Database"

2. Once created, copy the "External Database URL" from the database settings
3. Add this URL as the `DATABASE_URL` environment variable in your web service

### 4. Deploy

1. After setting up the environment variables, click "Create Web Service"
2. Render will automatically build and deploy your application
3. The first deployment might take a few minutes

## Troubleshooting

### Database Connection Issues

If you see authentication errors like:
```
password authentication failed for user "polycentral_db_user"
```

1. Verify that your `DATABASE_URL` environment variable is correctly set
2. Ensure the database user and password in the URL are correct
3. Check that the database is running and accessible

### Environment Variables

Make sure all required environment variables are set in the Render dashboard:
- `DATABASE_URL` (PostgreSQL connection string)
- `JWT_SECRET` (for JWT token signing)
- `JWT_REFRESH_SECRET` (for refresh token signing)
- `CORS_ORIGIN` (your frontend URL)

## Health Check

Once deployed, you can check if your service is running by visiting:
```
https://your-service-name.onrender.com/api/health
```

You should see a response like:
```json
{
  "status": "OK",
  "timestamp": "2023-01-01T00:00:00.000Z"
}