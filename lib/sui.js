// Mock SuiClient and SuiWallet for testing
class SuiClient {
    constructor({ url }) {
        this.url = url;
    }
    async callContract({ packageObjectId, module, function: func, arguments: args }) {
        // console.log(`Calling ${module}::${func} on ${packageObjectId} with args:`, args);
        return null; // Mock returns null
    }
}

window.SuiWallet = {
    getWallet: async () => ({
        requestAccounts: async () => ['0x6e8b65e7f53772bd5f4d9588f07deb4b30d0fff3a8aa0d4fc6103a92d45fff0a'],
        signAndExecuteTransaction: async (tx) => {
            // console.log('Executing transaction:', tx);
            return { digest: 'mock-digest' };
        },
    }),
};