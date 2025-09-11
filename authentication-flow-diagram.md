# Authentication Flow Analysis

## System Architecture

```mermaid
graph TD
    A[User] --> B[Browser Frontend]
    B --> C[localStorage]
    C --> D[JWT Token]
    B --> E[API Requests]
    E --> F[Backend Server]
    F --> G[JWT Verification]
    G --> H[Database]
    H --> I[User Data]
    G --> J[Authorization Decision]
    J --> K[API Response]
    K --> B
```

## Authentication Flow Steps

### 1. User Registration
```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant D as Database
    
    U->>F: Clicks Register
    F->>B: POST /api/auth/register
    B->>D: Insert user record
    D->>B: User created
    B->>F: JWT token + user data
    F->>C: Store token in localStorage
    F->>U: Show success message
```

### 2. User Login
```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant D as Database
    
    U->>F: Enters credentials
    F->>B: POST /api/auth/login
    B->>D: Verify credentials
    D->>B: User data
    B->>F: JWT token + user data
    F->>C: Store token in localStorage
    F->>U: Show dashboard
```

### 3. API Request with Authentication
```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant C as localStorage
    participant B as Backend
    participant G as JWT Middleware
    
    U->>F: Clicks action (claim coins/enter tournament)
    F->>C: Get token
    C->>F: Return JWT token
    F->>B: POST /api/endpoint with Bearer token
    B->>G: Verify JWT
    G->>B: Token validation result
    B->>F: API response or error
    F->>U: Show result or error
```

## Current Issues Identified

### 1. Token Validation Problems
```mermaid
graph LR
    A[Frontend Token] --> B[localStorage]
    B --> C[API Request]
    C --> D[Backend JWT Middleware]
    D --> E{Token Valid?}
    E -->|No| F[403 Forbidden]
    E -->|Yes| G[Process Request]
```

**Potential Issues:**
- Token secret mismatch
- Token format corruption
- Token expiration
- Invalid token encoding

### 2. Tournament Options Display Issues
```mermaid
graph LR
    A[Tournament Data] --> B[Backend]
    B --> C[JSON Options]
    C --> D[API Response]
    D --> E[Frontend]
    E --> F{Options Parsing}
    F -->|Success| G[Display Options]
    F -->|Failure| H[Empty Options]
```

**Potential Issues:**
- JSON parsing errors
- Tournament type mismatch
- Missing options field
- Incorrect data structure

## Data Flow Analysis

### JWT Token Lifecycle
```mermaid
stateDiagram-v2
    [*] --> Created: User registers/logs in
    Created --> Stored: Saved to localStorage
    Stored --> Sent: Used in API requests
    Sent --> Validated: Backend verification
    Validated --> Valid: Request processed
    Validated --> Invalid: Error returned
    Invalid --> Refreshed: Token refresh logic
    Refreshed --> Stored: New token saved
    Stored --> Expired: Token expires
    Expired --> Cleared: Token removed
    Cleared --> [*]: User must re-authenticate
```

### Tournament Data Flow
```mermaid
flowchart TD
    A[Database Tournament] --> B[Backend Query]
    B --> C[API Response]
    C --> D[Frontend Fetch]
    D --> E[Tournament Options Parse]
    E --> F{Parse Success?}
    F -->|Yes| G[Display Options]
    F -->|No| H[Show Error]
    G --> I[User Selection]
    I --> J[Submit Prediction]
    J --> K[API Entry Request]
    K --> L{Tournament Entry}
```

## Solution Implementation Strategy

### 1. Authentication Fixes
```mermaid
graph TD
    A[Add Token Validation] --> B[Check Token Format]
    B --> C[Verify Token Secret]
    C --> D[Handle Token Expiration]
    D --> E[Implement Token Refresh]
    E --> F[Add Error Handling]
    F --> G[Test Authentication Flow]
```

### 2. Tournament Options Fixes
```mermaid
graph TD
    A[Enhanced Options Parsing] --> B[Detect Tournament Type]
    B --> C[Parse Options Based on Type]
    C --> D[Handle Parsing Errors]
    D --> E[Fallback Options]
    E --> F[Display Options UI]
    F --> G[Test Tournament Entry]
```

## Testing Strategy

### 1. Authentication Testing
```mermaid
graph TD
    A[Token Creation] --> B[Token Storage]
    B --> C[Token Retrieval]
    C --> D[API Request with Token]
    D --> E[Token Validation]
    E --> F[Authorization Decision]
    F --> G[Response Handling]
```

### 2. Tournament Testing
```mermaid
graph TD
    A[Load Tournaments] --> B[Parse Tournament Data]
    B --> C[Display Options]
    C --> D[User Selection]
    D --> E[Submit Entry]
    E --> F[Process Entry]
    F --> G[Update UI]
```

This analysis provides a comprehensive view of the authentication flow and identifies the key areas where issues might occur. The diagrams help visualize the system architecture and potential problem areas.