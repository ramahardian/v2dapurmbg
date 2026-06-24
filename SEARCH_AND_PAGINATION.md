# Search and Pagination Features

## Overview

This implementation adds search and pagination capabilities to the menu management system in MBG Kitchen SaaS.

## Changes Made

### 1. Backend API (`routes/menu.js`)

Added search and pagination support to the `/api/menu` GET endpoint:

- **Search functionality**: Supports searching by menu name, category, and description
- **Pagination**: Supports page and limit query parameters
- **Optimized query**: Uses a single JOIN query instead of N+1 queries for better performance

Key features:
- Search term supports partial matching using `%term%`
- Returns structured response with data and pagination metadata
- Maintains backwards compatibility with existing frontend

### 2. Frontend Template (`views/partials/menu.ejs`)

Enhanced the menu display with:

- **Search input**: Real-time search with debouncing (300ms delay)
- **Pagination controls**: Navigation buttons for page navigation
- **Loading states**: Visual feedback during data fetching
- **Empty states**: Appropriate messages for different scenarios
- **Responsive design**: Mobile-friendly pagination

Key features:
- Search updates URL parameters automatically
- Auto-refresh when search term changes
- Smooth pagination with page number buttons
- Previous/Next navigation buttons
- Intelligent page range calculation

## Usage

### Search
Type in the search box to filter menus by name, category, or description in real-time.

### Pagination
Navigate through menu pages using:
- **Previous/Next buttons**: Jump to adjacent pages
- **Page numbers**: Direct navigation to specific pages
- **Auto-scaling**: Page numbers adjust based on total pages

## Benefits

1. **Improved User Experience**: Quick search and efficient navigation
2. **Better Performance**: Reduced server load with optimized queries
3. **Scalability**: Handles large datasets efficiently
4. **Backwards Compatibility**: Existing functionality remains unchanged
5. **Mobile-Friendly**: Responsive design for all devices

## API Response Format

```json
{
  "data": [
    {
      "id": 1,
      "nama": "Menu A",
      "kategori_penerima": "Ibu Hamil",
      "deskripsi": "Deskripsi menu",
      "gramasi_total": 200,
      "kalori": 150,
      "protein": 10,
      "karbohidrat": 20,
      "lemak": 5,
      "serat": 3,
      "bahan": [
        { "bahan_baku_id": 1, "nama": "Bahan 1", "satuan": "kg", "jumlah": 100 }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5
  }
}
```

## URL Parameters

- `page`: Current page number (default: 1)
- `limit`: Items per page (default: 10)
- `search`: Search term for filtering (optional)

Example:
```
GET /api/menu?page=2&limit=20&search=Menu
```