const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.json');
const PRODUCTS_PATH = path.join(__dirname, 'products.json');

// Initialize database file if it doesn't exist
function initDb() {
  if (!fs.existsSync(DB_PATH)) {
    const defaultData = {
      profiles: [],
      scans: [],
      clicks: [],
      subscriptions: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

// Read database contents
function readDb() {
  initDb();
  try {
    const content = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Error reading JSON database:', err);
    return { profiles: [], scans: [], clicks: [], subscriptions: [] };
  }
}

// Write database contents
function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing JSON database:', err);
  }
}

// Load products
function getProducts() {
  try {
    if (fs.existsSync(PRODUCTS_PATH)) {
      return JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading products catalog:', err);
  }
  return [];
}

const db = {
  profiles: {
    find: (userId) => {
      const data = readDb();
      return data.profiles.find(p => p.id === userId) || null;
    },
    findByName: (name) => {
      const data = readDb();
      return data.profiles.find(p => p.name && p.name.trim().toLowerCase() === name.trim().toLowerCase()) || null;
    },
    listAll: () => {
      const data = readDb();
      return data.profiles;
    },
    save: (profile) => {
      const data = readDb();
      const idx = data.profiles.findIndex(p => p.id === profile.id);
      if (idx !== -1) {
        data.profiles[idx] = { ...data.profiles[idx], ...profile, updatedAt: new Date().toISOString() };
      } else {
        const id = profile.id || uuidv4();
        profile = { id, ...profile, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        data.profiles.push(profile);
      }
      writeDb(data);
      return profile;
    }
  },
  
  scans: {
    listAll: () => {
      const data = readDb();
      return data.scans;
    },
    findByUser: (userId) => {
      const data = readDb();
      return data.scans
        .filter(s => s.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    find: (scanId) => {
      const data = readDb();
      return data.scans.find(s => s.id === scanId) || null;
    },
    create: (scanData) => {
      const data = readDb();
      const newScan = {
        id: uuidv4(),
        ...scanData,
        createdAt: new Date().toISOString()
      };
      data.scans.push(newScan);
      writeDb(data);
      return newScan;
    },
    deleteUserHistory: (userId) => {
      const data = readDb();
      data.scans = data.scans.filter(s => s.userId !== userId);
      data.clicks = data.clicks.filter(c => c.userId !== userId);
      
      // Also reset profile skin metrics if stored
      const profileIdx = data.profiles.findIndex(p => p.id === userId);
      if (profileIdx !== -1) {
        data.profiles[profileIdx].skinGoals = [];
        data.profiles[profileIdx].skinType = null;
      }
      
      // Reset subscription to free
      const subIdx = data.subscriptions.findIndex(s => s.userId === userId);
      if (subIdx !== -1) {
        data.subscriptions[subIdx] = {
          userId,
          status: 'free',
          tier: null,
          expiresAt: null,
          updatedAt: new Date().toISOString()
        };
      }
      
      writeDb(data);
      return true;
    }
  },

  products: {
    list: () => {
      return getProducts();
    },
    recommend: (lowestDimensions) => {
      const allProducts = getProducts();
      const matched = allProducts.filter(prod => 
        prod.dimensions.some(dim => lowestDimensions.includes(dim))
      );
      // Shuffle matches to guarantee a diverse selection of brands (prevent single brand bias)
      return matched.sort(() => 0.5 - Math.random()).slice(0, 3);
    }
  },

  clicks: {
    listAll: () => {
      const data = readDb();
      return data.clicks;
    },
    log: (userId, productId, scanId) => {
      const data = readDb();
      const clickEntry = {
        id: uuidv4(),
        userId,
        productId,
        scanId: scanId || null,
        clickedAt: new Date().toISOString()
      };
      data.clicks.push(clickEntry);
      writeDb(data);
      return clickEntry;
    },
    getClicks: (userId) => {
      const data = readDb();
      return data.clicks.filter(c => c.userId === userId);
    }
  },

  subscriptions: {
    listAll: () => {
      const data = readDb();
      return data.subscriptions;
    },
    find: (userId) => {
      const data = readDb();
      return data.subscriptions.find(s => s.userId === userId) || {
        userId,
        status: 'free',
        tier: null,
        expiresAt: null
      };
    },
    save: (userId, subData) => {
      const data = readDb();
      const idx = data.subscriptions.findIndex(s => s.userId === userId);
      const entry = {
        userId,
        status: subData.status || 'free',
        tier: subData.tier || null,
        expiresAt: subData.expiresAt || null,
        updatedAt: new Date().toISOString()
      };
      
      if (idx !== -1) {
        data.subscriptions[idx] = entry;
      } else {
        data.subscriptions.push(entry);
      }
      
      // Update main profile status for easier access
      const profileIdx = data.profiles.findIndex(p => p.id === userId);
      if (profileIdx !== -1) {
        data.profiles[profileIdx].subscriptionStatus = entry.status;
      }
      
      writeDb(data);
      return entry;
    }
  }
};

module.exports = db;
