# GeoPulse - AI-Powered Geospatial Intelligence for Africa

Advanced environmental monitoring and geospatial analysis platform powered by AI and satellite imagery.

## Features

- **Satellite Imagery Analysis**: Process and analyze satellite data for environmental monitoring
- **AI-Powered Insights**: Leverage machine learning for intelligent geospatial analysis
- **Interactive Maps**: Visualize data with interactive mapping capabilities
- **Real-time Monitoring**: Track environmental changes and hazards in real-time
- **Data Export**: Export analysis results in various GIS formats
- **User Authentication**: Secure user management with Supabase

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI Framework**: Tailwind CSS, Radix UI components
- **Maps**: MapLibre GL, Leaflet
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **AI/ML**: Integration with Google Earth Engine and AI models

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd dagawie-main
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory with your Supabase configuration:
```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

4. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:8080`

## Supabase Setup

This project uses Supabase for backend services. To set up the backend:

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Copy your project URL and anon key to the `.env` file
3. Run the database migrations in the `supabase/migrations` folder
4. Deploy the edge functions in the `supabase/functions` folder

### Database Schema

The application includes several key tables:
- User profiles and authentication
- Satellite imagery metadata
- Analysis results
- Geographic data

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License.
