# GDAX Notifier 📈🔔

GDAX Notifier runs in your terminal and keeps a close watch on your on your open trades.
When it sees a trade that's been filled it'll notify you via the Notification Centre like so:

<img width="348" alt="order-filled" src="https://user-images.githubusercontent.com/4335450/40278658-4a5aaf56-5c2d-11e8-8cd2-6af8b2848ff3.png">


It's also aware of other changes to your trades (additions, cancellations, part-fills) and will print a summary of those changes in the terminal:

<img width="213" alt="order-changes" src="https://user-images.githubusercontent.com/4335450/40278747-d01aac94-5c2e-11e8-8837-105dd6a6b1cb.png">

### Getting Started

- Clone this project
- Navigate to this project in the terminal
- Create a config file and fill it with your GDAX details (See 'Configuring GDAX')
- Run `yarn` or `npm install` to install this projects dependencies
- Run `yarn start` or `npm start` to start the app


### Configuring GDAX

In order to keep an eye on your orders, GDAX Notifier needs Authorized API access to your account.
This access is given via 3 parameters: An API key, an API secret and the pass-phrase associated with that API key, more on which you can read about [here](https://docs.gdax.com/#authentication).

You can generate the API key, secret and pass-phrase at [gdax.com/settings/api](https://www.gdax.com/settings/api). This app only requires 'View' permissions, so it's recommended that you select 'View' when generating the key to be used here.
This app expects these details to be found in a file named `__c.js` and in a particular format...

 - First, generate your API key (View only recommended)
 - Then create a new file in the root of the project, named `__c.js` with the command: `touch __c.js` 
 - Next, open this file and format it like so, replacing the placeholders with values generated through GDAX:
```js
module.exports = ( {
	KEY: 'Your API key',
	SECRET: 'Your API secret',
	PASSPHRASE: 'Your API pass-phrase',
	USE_SANDBOX: false,
} );
```
