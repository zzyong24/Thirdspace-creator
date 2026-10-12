// Keep generated account/source labels stable while producing auditable UI copy.
// Test databases are isolated per run, so a fixed clock cannot collide with user data.
Date.now = () => 1785729600000;
