const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[SkinIQ] ERROR: Supabase URL and Key must be configured in environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to map DB profile row (snake_case) to client profile type (camelCase)
function mapProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ageRange: row.age_range,
    skinType: row.skin_type,
    skinGoals: row.skin_goals || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Helper to map DB scan row to client scan type
function mapScan(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    imageUrl: row.image_url,
    imageRetained: row.image_retained,
    scores: row.scores,
    explanations: row.explanations,
    general_summary: row.general_summary,
    createdAt: row.created_at,
    detections: row.detections || [],
    recommended_products: row.recommended_products || [],
    isFrontFacing: row.is_front_facing || false
  };
}

// Initialize database by pre-populating products if empty
async function initDatabase() {
  try {
    const { data: existingProducts, error } = await supabase
      .from('products')
      .select('id')
      .limit(1);

    if (error) {
      console.warn('[SkinIQ] Error checking products table in Supabase:', error.message);
      return;
    }

    if (!existingProducts || existingProducts.length === 0) {
      console.log('[SkinIQ] Supabase products table is empty. Pre-populating from products.json...');
      const productsPath = path.join(__dirname, 'products.json');
      if (fs.existsSync(productsPath)) {
        const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
        
        // Map products.json dimensions to DB schema structure
        const formattedProducts = productsData.map(p => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          price_inr: p.price_inr,
          affiliate_link: p.affiliate_link,
          reason_text: p.reason_text,
          dimensions: p.dimensions,
          image_url: p.image_url
        }));

        const { error: insertError } = await supabase
          .from('products')
          .insert(formattedProducts);

        if (insertError) {
          console.error('[SkinIQ] Error seeding products to Supabase:', insertError.message);
        } else {
          console.log('[SkinIQ] Successfully pre-populated products in Supabase!');
        }
      }
    }
  } catch (err) {
    console.error('[SkinIQ] Failed to initialize database seeding:', err);
  }
}

// Start async initialization in background
initDatabase();

const db = {
  profiles: {
    find: async (userId) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (error) {
        if (error.code !== 'PGRST116') { // PGRST116: 0 rows returned
          console.error('[SkinIQ] Supabase profile find error:', error.message);
        }
        return null;
      }
      return mapProfile(data);
    },
    
    findByName: async (name) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('name', name.trim())
        .limit(1);
        
      if (error) {
        console.error('[SkinIQ] Supabase profile findByName error:', error.message);
        return null;
      }
      return data && data.length > 0 ? mapProfile(data[0]) : null;
    },
    
    listAll: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('[SkinIQ] Supabase profiles listAll error:', error.message);
        return [];
      }
      return data.map(mapProfile);
    },
    
    save: async (profile) => {
      const payload = {
        id: profile.id,
        name: profile.name,
        age_range: profile.ageRange,
        skin_type: profile.skinType || null,
        skin_goals: profile.skinGoals || [],
        updated_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload)
        .select()
        .single();
        
      if (error) {
        console.error('[SkinIQ] Supabase profile save error:', error.message);
        throw error;
      }
      return mapProfile(data);
    }
  },
  
  scans: {
    listAll: async () => {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('[SkinIQ] Supabase scans listAll error:', error.message);
        return [];
      }
      return data.map(mapScan);
    },
    
    findByUser: async (userId) => {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('[SkinIQ] Supabase scans findByUser error:', error.message);
        return [];
      }
      return data.map(mapScan);
    },
    
    find: async (scanId) => {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .eq('id', scanId)
        .single();
        
      if (error) {
        console.error('[SkinIQ] Supabase scan find error:', error.message);
        return null;
      }
      return mapScan(data);
    },
    
    create: async (scanData) => {
      const payload = {
        user_id: scanData.userId,
        image_url: scanData.imageUrl || null,
        image_retained: !!scanData.imageRetained,
        scores: scanData.scores,
        explanations: scanData.explanations,
        general_summary: scanData.general_summary,
        detections: scanData.detections || [],
        recommended_products: scanData.recommended_products || [],
        is_front_facing: !!scanData.isFrontFacing
      };
      
      const { data, error } = await supabase
        .from('scans')
        .insert(payload)
        .select()
        .single();
        
      if (error) {
        console.error('[SkinIQ] Supabase scan create error:', error.message);
        throw error;
      }
      return mapScan(data);
    },
    
    deleteUserHistory: async (userId) => {
      const { error: scansErr } = await supabase
        .from('scans')
        .delete()
        .eq('user_id', userId);
        
      const { error: clicksErr } = await supabase
        .from('clicks')
        .delete()
        .eq('user_id', userId);
        
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ skin_goals: [], skin_type: null })
        .eq('id', userId);
        
      const { error: subErr } = await supabase
        .from('subscriptions')
        .update({ status: 'free', tier: null, expires_at: null })
        .eq('user_id', userId);
        
      if (scansErr || clicksErr || profErr || subErr) {
        console.error('[SkinIQ] Supabase deleteUserHistory error:', scansErr || clicksErr || profErr || subErr);
        return false;
      }
      return true;
    }
  },
  
  products: {
    list: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: true });
        
      if (error) {
        console.error('[SkinIQ] Supabase products list error:', error.message);
        return [];
      }
      
      return data;
    },
    
    recommend: async (lowestDimensions) => {
      const { data, error } = await supabase
        .from('products')
        .select('*');
        
      if (error) {
        console.error('[SkinIQ] Supabase products recommend error:', error.message);
        return [];
      }
      
      const matched = data.filter(prod => 
        prod.dimensions.some(dim => lowestDimensions.includes(dim))
      );
      
      return matched.sort(() => 0.5 - Math.random()).slice(0, 3);
    }
  },
  
  clicks: {
    listAll: async () => {
      const { data, error } = await supabase
        .from('clicks')
        .select('*')
        .order('clicked_at', { ascending: false });
        
      if (error) {
        console.error('[SkinIQ] Supabase clicks listAll error:', error.message);
        return [];
      }
      
      return data.map(row => ({
        id: row.id,
        userId: row.user_id,
        productId: row.product_id,
        scanId: row.scan_id,
        clickedAt: row.clicked_at
      }));
    },
    
    log: async (userId, productId, scanId) => {
      const payload = {
        user_id: userId,
        product_id: productId,
        scan_id: scanId || null
      };
      
      const { data, error } = await supabase
        .from('clicks')
        .insert(payload)
        .select()
        .single();
        
      if (error) {
        console.error('[SkinIQ] Supabase clicks log error:', error.message);
        throw error;
      }
      
      return {
        id: data.id,
        userId: data.user_id,
        productId: data.product_id,
        scanId: data.scan_id,
        clickedAt: data.clicked_at
      };
    }
  },
  
  subscriptions: {
    listAll: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .order('updated_at', { ascending: false });
        
      if (error) {
        console.error('[SkinIQ] Supabase subscriptions listAll error:', error.message);
        return [];
      }
      
      return data.map(row => ({
        userId: row.user_id,
        status: row.status,
        tier: row.tier,
        expiresAt: row.expires_at
      }));
    },
    
    find: async (userId) => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();
        
      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('[SkinIQ] Supabase subscription find error:', error.message);
        }
        return {
          userId,
          status: 'free',
          tier: null,
          expiresAt: null
        };
      }
      
      return {
        userId: data.user_id,
        status: data.status,
        tier: data.tier,
        expiresAt: data.expires_at
      };
    },
    
    save: async (userId, subData) => {
      const payload = {
        user_id: userId,
        status: subData.status || 'free',
        tier: subData.tier || null,
        expires_at: subData.expiresAt || null,
        updated_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('subscriptions')
        .upsert(payload)
        .select()
        .single();
        
      if (error) {
        console.error('[SkinIQ] Supabase subscription save error:', error.message);
        throw error;
      }
      
      return {
        userId: data.user_id,
        status: data.status,
        tier: data.tier,
        expiresAt: data.expires_at
      };
    }
  }
};

module.exports = db;
