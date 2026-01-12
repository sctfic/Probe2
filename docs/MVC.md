graph TB
    Client([Client]) --> Route
    subgraph "Couche API"
        Route --> Middleware
        Middleware --> Controller
    end
    
    subgraph "Couche Logique"
        Controller --> Service
    end
    
    subgraph "Couche Données"
        Service --> Model[(Model/DB)]
    end
    
    Service --> Service2[Autre Service]
    
    Controller --> Response{Response}
    Model --> Response
    
    Response --> Client
    
    style Route fill:#e1f5fe
    style Middleware fill:#fff3e0
    style Controller fill:#f3e5f5
    style Service fill:#e8f5e8
    style Model fill:#ffebee

# les middleware 
protege le controller (valide les demandes)
# les controller 
retranscrit et transmet la demande et les erreurs (valide les parametres)
# les service 
execute le metier
pourrai etre appeler par une autre appli (cron, intranet, app-desktop)

graph LR
    subgraph "Sources d'appel multiples"
        API[API REST] --> Service
        CRON[Tâche CRON] --> Service
        CLI[CLI/Desktop] --> Service
        WS[WebSocket] --> Service
    end
    
    Service --> endpoints[(Base de données, peripheriques)]
    
    style Service fill:#e8f5e8