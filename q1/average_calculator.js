const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

// Configuration
const WINDOW_SIZE = 10;
const TIMEOUT_MS = 500;
const TEST_SERVER_BASE_URL = 'http://20.244.56.144/evaluation-service';

// Authentication data
const authData = {
  token_type: "Bearer", // Update this with your token_type value
  access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiZXhwIjoxNzQzNTk4OTQ5LCJpYXQiOjE3NDM1OTg2NDksImlzcyI6IkFmZm9yZG1lZCIsImp0aSI6IjY3NjQ5Yzk1LTliYjMtNDBhYy05ODlkLThmMjA4YzgxM2JmOSIsInN1YiI6IjIyMDUyOTYwQGtpaXQuYWMuaW4ifSwiZW1haWwiOiIyMjA1Mjk2MEBraWl0LmFjLmluIiwibmFtZSI6ImFkaXR5YSBrdW1yZiIsInJvbGxObyI6IjIyMDUyOTYwIiwiYWNjZXNzQ29kZSI6Im53cHdyWiIsImNsaWVudElEIjoiNjc2NDljOTUtOWJiMy00MGFjLTk4OWQtOGYyMDhjODEzYmY5IiwiY2xpZW50U2VjcmV0IjoiaERiQXlZZ3RYUlVzbnN4dSJ9.dPtEgnUFF4NRbsBhremAJwOvy45hfDz0tLHSIqnU9rI", // Replace with your actual access token
  expires_in: 1743598949
  // Token expiry time in seconds
};

// Data storage
let numbersWindow = [];
let previousWindow = [];

// Middleware for parsing JSON
app.use(express.json());

// Helper function to calculate average
function calculateAverage(numbers) {
    if (numbers.length === 0) return 0;
    const sum = numbers.reduce((acc, num) => acc + num, 0);
    return (sum / numbers.length).toFixed(2);
}

// Helper function to fetch numbers from external APIs
async function fetchNumbers(type) {
    const endpoints = {
        'p': '/primes',
        'f': '/fibo',
        'e': '/even',
        'r': '/rand'
    };

    const endpoint = endpoints[type];
    if (!endpoint) {
        throw new Error('Invalid number type');
    }

    try {
        // Add authorization header with the token
        const response = await axios.get(${TEST_SERVER_BASE_URL}${endpoint}, {
            timeout: TIMEOUT_MS,
            headers: {
                'Authorization': ${authData.token_type} ${authData.access_token}
            }
        });

        if (response.data && response.data.numbers) {
            return response.data.numbers;
        }
        return [];
    } catch (error) {
        console.error(Error fetching ${type} numbers:, error.message);
        return [];
    }
}

// Root route
app.get('/', (req, res) => {
    res.send('Average Calculator Microservice is running. Use /numbers/p, /numbers/f, /numbers/e, or /numbers/r to access the API.');
});

// Route to handle qualified number IDs
app.get('/numbers/:numberId', async (req, res) => {
    const numberId = req.params.numberId;

    // Check if the ID is qualified
    if (!['p', 'f', 'e', 'r'].includes(numberId)) {
        return res.status(400).json({ error: 'Invalid number ID. Use p, f, e, or r.' });
    }

    try {
        // Fetch numbers from the third-party server
        const fetchedNumbers = await fetchNumbers(numberId);

        // Update the window with unique numbers
        previousWindow = [...numbersWindow];

        // Add unique numbers to the window
        fetchedNumbers.forEach(num => {
            if (!numbersWindow.includes(num)) {
                numbersWindow.push(num);
            }
        });

        // Trim window if it exceeds the size limit
        if (numbersWindow.length > WINDOW_SIZE) {
            numbersWindow = numbersWindow.slice(numbersWindow.length - WINDOW_SIZE);
        }

        // Calculate the average
        const avg = calculateAverage(numbersWindow);

        // Prepare response
        const response = {
            windowPrevState: previousWindow,
            windowCurrState: numbersWindow,
            numbers: fetchedNumbers,
            avg: parseFloat(avg)
        };

        res.json(response);
    } catch (error) {
        console.error('Error processing request:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(Average Calculator Microservice running on http://localhost:${port});
});
