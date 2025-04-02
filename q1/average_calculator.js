const express = require('express');
const axios = require('axios');
const app = express();

// Configuration
const PORT = 9876;
const TEST_SERVER = 'http://20.244.56.144/evaluation-service';
const WINDOW_SIZE = 10;
const TIMEOUT = 500; // milliseconds

// Data storage
let windowState = {
  windowPrevState: [],
  windowCurrState: [],
  numbers: []
};

// Helper function to calculate average
const calculateAverage = (numbers) => {
  if (numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  return (sum / numbers.length).toFixed(2);
};

// Route for handling qualified number IDs
app.get('/numbers/:id', async (req, res) => {
  const numberType = req.params.id;
  
  // Validate the number type
  if (!['p', 'f', 'e', 'r'].includes(numberType)) {
    return res.status(400).json({ error: 'Invalid number type. Use p (prime), f (fibonacci), e (even), or r (random)' });
  }
  
  try {
    // Determine which API endpoint to call based on the number type
    let endpoint;
    switch (numberType) {
      case 'p':
        endpoint = `${TEST_SERVER}/primes`;
        break;
      case 'f':
        endpoint = `${TEST_SERVER}/fibo`;
        break;
      case 'e':
        endpoint = `${TEST_SERVER}/even`;
        break;
      case 'r':
        endpoint = `${TEST_SERVER}/rand`;
        break;
    }
    
    // Fetch numbers from the appropriate endpoint with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    
    const response = await axios.get(endpoint, { signal: controller.signal })
      .finally(() => clearTimeout(timeoutId));
    
    // Update window state
    windowState.windowPrevState = [...windowState.windowCurrState];
    
    // Get unique numbers from the response
    const newNumbers = response.data.numbers;
    
    // Add new numbers to the current window state
    windowState.windowCurrState.push(...newNumbers);
    
    // Ensure window state doesn't exceed the window size
    if (windowState.windowCurrState.length > WINDOW_SIZE) {
      // Remove oldest numbers to maintain window size
      const excessCount = windowState.windowCurrState.length - WINDOW_SIZE;
      windowState.windowCurrState = windowState.windowCurrState.slice(excessCount);
    }
    
    // Update the combined numbers array with unique values
    windowState.numbers = [...new Set([...windowState.numbers, ...newNumbers])];
    
    // Calculate the average
    const avg = calculateAverage(windowState.windowCurrState);
    
    // Prepare the response
    const responseData = {
      windowPrevState: windowState.windowPrevState,
      windowCurrState: windowState.windowCurrState,
      numbers: newNumbers,
      avg: parseFloat(avg)
    };
    
    res.json(responseData);
  } catch (error) {
    if (error.name === 'AbortError' || (error.code && error.code === 'ECONNABORTED')) {
      return res.status(408).json({ error: 'Request timeout - exceeded 500ms' });
    }
    console.error('Error fetching data:', error.message);
    res.status(500).json({ error: 'Failed to fetch numbers' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Average Calculator microservice running on http://localhost:${PORT}`);
});