// Import required modules
const express = require('express');
const axios = require('axios');

// Initialize Express app
const app = express();
const port = 1001;

// Configuration
const TEST_SERVER = 'http://20.244.56.144/evaluation-service';

// In-memory data store with TTL (time-to-live) for cache invalidation
let usersCache = null;
let postsCache = {};
let commentsCache = {};
let userPostCountsCache = null;
const CACHE_TTL = 300000; // 5 minutes in milliseconds

// Helper function to get all users
async function fetchUsers() {
  if (usersCache && (Date.now() - usersCache.timestamp) < CACHE_TTL) {
    return usersCache.data;
  }

  try {
    const response = await axios.get(`${TEST_SERVER}/users`);
    if (response.data && response.data.users) {
      usersCache = {
        data: response.data.users,
        timestamp: Date.now()
      };
      return usersCache.data;
    }
    throw new Error('Invalid response structure');
  } catch (error) {
    console.error('Error fetching users:', error.message);
    throw error;
  }
}

// Helper function to get posts for a specific user
async function fetchUserPosts(userId) {
  if (postsCache[userId] && (Date.now() - postsCache[userId].timestamp) < CACHE_TTL) {
    return postsCache[userId].data;
  }

  try {
    const response = await axios.get(`${TEST_SERVER}/users/${userId}/posts`);
    // Fix for the malformed response in the example
    let posts = [];
    if (Array.isArray(response.data?.posts)) {
      posts = response.data.posts;
    } else if (response.data && typeof response.data === 'object') {
      // Handle case where response might be malformed
      posts = Object.values(response.data).filter(item => item.id && item.userid);
    }
    
    postsCache[userId] = {
      data: posts,
      timestamp: Date.now()
    };
    return postsCache[userId].data;
  } catch (error) {
    console.error(`Error fetching posts for user ${userId}:`, error.message);
    throw error;
  }
}

// Helper function to get comments for a specific post
async function fetchPostComments(postId) {
  // Clean postId in case it has invalid characters (like '15g' in the example)
  const cleanPostId = String(postId).replace(/[^0-9]/g, '');
  
  if (commentsCache[cleanPostId] && (Date.now() - commentsCache[cleanPostId].timestamp) < CACHE_TTL) {
    return commentsCache[cleanPostId].data;
  }

  try {
    const response = await axios.get(`${TEST_SERVER}/posts/${cleanPostId}/comments`);
    // Handle malformed response (like in the example)
    let comments = [];
    if (Array.isArray(response.data)) {
      comments = response.data;
    } else if (typeof response.data === 'object') {
      // Extract comments from malformed response
      comments = Object.values(response.data).filter(item => item.id && item.postid);
    }
    
    commentsCache[cleanPostId] = {
      data: comments,
      timestamp: Date.now()
    };
    return commentsCache[cleanPostId].data;
  } catch (error) {
    console.error(`Error fetching comments for post ${cleanPostId}:`, error.message);
    // Return empty array if comments not found
    return [];
  }
}

// Helper function to calculate user post counts
async function calculateUserPostCounts() {
  if (userPostCountsCache && (Date.now() - userPostCountsCache.timestamp) < CACHE_TTL) {
    return userPostCountsCache.data;
  }

  try {
    const users = await fetchUsers();
    const userPostCounts = {};

    // Process each user
    for (const userId in users) {
      const posts = await fetchUserPosts(userId);
      userPostCounts[userId] = {
        name: users[userId],
        count: posts.length
      };
    }

    userPostCountsCache = {
      data: userPostCounts,
      timestamp: Date.now()
    };
    return userPostCountsCache.data;
  } catch (error) {
    console.error('Error calculating user post counts:', error.message);
    throw error;
  }
}

// API 1: Top Users
app.get('/users', async (req, res) => {
  try {
    const userPostCounts = await calculateUserPostCounts(); // Fixed variable name

    // Convert to array for sorting
    const usersArray = Object.keys(userPostCounts).map(userId => ({
      userId,
      name: userPostCounts[userId].name,
      postCount: userPostCounts[userId].count
    }));

    // Sort by post count (descending) and then by name for ties
    usersArray.sort((a, b) => {
      if (b.postCount !== a.postCount) {
        return b.postCount - a.postCount;
      }
      return a.name.localeCompare(b.name);
    });

    // Return top 5 users
    const topUsers = usersArray.slice(0, 5);

    res.json({
      success: true,
      data: {
        topUsers: topUsers.map(user => ({
          userId: user.userId,
          name: user.name,
          postCount: user.postCount
        }))
      }
    });
  } catch (error) {
    console.error('Error in /users endpoint:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch top users',
      message: error.message
    });
  }
});

// Helper function to get popular posts (with most comments)
async function getPopularPosts() {
  try {
    const users = await fetchUsers();
    let allPosts = [];

    // Get posts for all users
    for (const userId in users) {
      const userPosts = await fetchUserPosts(userId);
      for (const post of userPosts) {
        // Fetch comments for each post
        const comments = await fetchPostComments(post.id);
        allPosts.push({
          ...post,
          commentCount: comments.length,
          comments: comments
        });
      }
    }

    // Sort by comment count (descending) and then by post ID for ties
    allPosts.sort((a, b) => {
      if (b.commentCount !== a.commentCount) {
        return b.commentCount - a.commentCount;
      }
      return b.id - a.id; // Higher ID means newer post
    });

    return allPosts;
  } catch (error) {
    console.error('Error getting popular posts:', error.message);
    throw error;
  }
}

// Helper function to get latest posts
async function getLatestPosts() {
  try {
    const users = await fetchUsers();
    let allPosts = [];

    // Get posts for all users
    for (const userId in users) {
      const userPosts = await fetchUserPosts(userId);
      allPosts = [...allPosts, ...userPosts];
    }

    // Sort by ID (assuming higher IDs are newer posts)
    allPosts.sort((a, b) => b.id - a.id);

    return allPosts;
  } catch (error) {
    console.error('Error getting latest posts:', error.message);
    throw error;
  }
}

// API 2: Get Top/Latest Posts
app.get('/posts', async (req, res) => {
  try {
    const type = req.query.type || 'popular';

    if (type === 'popular') {
      const popularPosts = await getPopularPosts();

      if (popularPosts.length === 0) {
        return res.json({
          success: true,
          data: {
            type: 'popular',
            message: 'No posts found',
            posts: []
          }
        });
      }

      // Find the maximum comment count
      const maxCommentCount = popularPosts[0].commentCount;

      // Get all posts with that maximum comment count
      const topPosts = popularPosts.filter(post => post.commentCount === maxCommentCount);

      res.json({
        success: true,
        data: {
          type: 'popular',
          maxCommentCount,
          posts: topPosts.map(async post => ({
            id: post.id,
            userId: post.userId,
            userName: (await fetchUsers())[post.userId] || 'Unknown',
            content: post.content,
            commentCount: post.commentCount
          }))
        }
      });
    } else if (type === 'latest') {
      const latestPosts = await getLatestPosts();

      // Return latest 5 posts
      const top5Posts = latestPosts.slice(0, 5);

      // Get user names for these posts
      const users = await fetchUsers();

      res.json({
        success: true,
        data: {
          type: 'latest',
          posts: top5Posts.map(post => ({
            id: post.id,
            userId: post.userId,
            userName: users[post.userId] || 'Unknown',
            content: post.content,
            timestamp: post.id // Using ID as proxy for timestamp
          }))
        }
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: 'Invalid type parameter',
        message: 'Use "popular" or "latest" as the type parameter'
      });
    }
  } catch (error) {
    console.error('Error in /posts endpoint:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch posts',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Default route
app.get('/', (req, res) => {
  res.send(`
    <h1>Social Media Analytics Microservice</h1>
    <p>Available endpoints:</p>
    <ul>
      <li><a href="/users">/users</a> - Get top 5 users with the highest number of posts</li>
      <li><a href="/posts?type=popular">/posts?type=popular</a> - Get posts with maximum number of comments</li>
      <li><a href="/posts?type=latest">/posts?type=latest</a> - Get latest 5 posts</li>
    </ul>
    <p>Cache will automatically refresh every 5 minutes.</p>
  `);
});

// Start the server
app.listen(port, () => {
  console.log(`Social Media Analytics microservice running on http://localhost:${port}`);
});