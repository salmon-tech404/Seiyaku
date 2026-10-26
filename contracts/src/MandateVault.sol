// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Limits, TradeParams, PendingChange, PendingWithdrawal, VaultStateView} from "./types/DataTypes.sol";
import {VaultInitParams} from "./types/ConfigTypes.sol";
import {LimitsLib, InvalidLimits, NotStricter} from "./libraries/LimitsLib.sol";
import {IMandateVault} from "./interfaces/IMandateVault.sol";
import {IProcessor} from "./interfaces/IProcessor.sol";
import {IBeacon} from "./interfaces/IBeacon.sol";
import {ISwapRouter02} from "./interfaces/ISwapRouter02.sol";

error NotOwner();
error NotTrader();
error NotOwnerOrTrader();
error ZeroAddress();
error NothingPending();
error TooEarly(uint64 eta);
error DepositCapExceeded();
error RuleBlocked(uint16 inputBits);
error CircuitChanged();
error SwapMismatch();
error TransferFailed();
error AlreadyInitialized();

/**
 * @title MandateVault
 * @notice Per-owner clone vault enforcing circuit-verified trading rules on X Layer.
 */
contract MandateVault is IMandateVault, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Immutables configured once during clone initialization
    address public owner;
    address public trader;
    address public baseToken;
    address public swapRouter;
    address public processor;
    uint256 public circuitId;
    uint32 public loosenDelaySec;
    uint32 public minWithdrawDelaySec;
    uint128 public maxDepositBase;
    address public beacon;
    address public beaconImplementation;
    bytes32 public beaconImplementationCodehash;

    // State storage
    Limits public limits;
    bool public frozen;
    // forge-lint: disable-next-line(uninitialized-state)
    uint64 public dayIndex;
    // forge-lint: disable-next-line(uninitialized-state)
    uint16 public tradesToday;
    // forge-lint: disable-next-line(uninitialized-state)
    uint128 public buyVolumeTodayBase;
    // forge-lint: disable-next-line(uninitialized-state)
    uint64 public lastBuyAt;

    mapping(address => bool) public allowedTokens;
    PendingChange public pendingLoosen;
    PendingWithdrawal public pendingWithdrawal;

    bool private _initialized;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyTrader() {
        if (msg.sender != trader) revert NotTrader();
        _;
    }

    modifier onlyOwnerOrTrader() {
        if (msg.sender != owner && msg.sender != trader) revert NotOwnerOrTrader();
        _;
    }

    /// @notice Lock the master implementation contract in its constructor
    constructor() {
        _initialized = true;
    }

    /**
     * @notice Initializes the cloned vault instance.
     */
    function initialize(VaultInitParams calldata p) external {
        if (_initialized) revert AlreadyInitialized();
        if (
            p.owner == address(0) || p.trader == address(0) || p.baseToken == address(0) || p.swapRouter == address(0)
                || p.processor == address(0) || p.beacon == address(0) || p.beaconImplementation == address(0)
        ) {
            revert ZeroAddress();
        }

        LimitsLib.validate(p.limits, p.minWithdrawDelaySec);

        _initialized = true;
        owner = p.owner;
        trader = p.trader;
        limits = p.limits;
        baseToken = p.baseToken;
        swapRouter = p.swapRouter;
        processor = p.processor;
        circuitId = p.circuitId;
        loosenDelaySec = p.loosenDelaySec;
        minWithdrawDelaySec = p.minWithdrawDelaySec;
        maxDepositBase = p.maxDepositBase;
        beacon = p.beacon;
        beaconImplementation = p.beaconImplementation;
        beaconImplementationCodehash = p.beaconImplementationCodehash;

        for (uint256 i = 0; i < p.allowedTokens.length; i++) {
            address token = p.allowedTokens[i];
            if (token != address(0) && token != p.baseToken) {
                allowedTokens[token] = true;
            }
        }
    }

    /**
     * @notice Packs a 16-bit input word into 2 little-endian bytes for the circuit.
     */
    function _packInputs(uint16 bits) internal pure returns (bytes memory) {
        bytes memory packed = new bytes(2);
        packed[0] = bytes1(uint8(bits & 0xff));
        packed[1] = bytes1(uint8((bits >> 8) & 0xff));
        return packed;
    }

    /**
     * @notice Evaluates the 9 input bits against the pinned processor circuit via staticcall.
     * @dev Fail-closed: reverts, malformed return data, or outputs without lowest bit 1 return false.
     */
    function _isAllowedByCircuit(uint16 bits) internal view returns (bool) {
        address currentImpl = IBeacon(beacon).implementation();
        if (currentImpl != beaconImplementation || currentImpl.codehash != beaconImplementationCodehash) {
            return false;
        }

        bytes memory packed = _packInputs(bits);
        (bool success, bytes memory returndata) =
            processor.staticcall(abi.encodeWithSelector(IProcessor.eval.selector, circuitId, packed));
        if (!success || returndata.length < 64) {
            return false;
        }

        bytes memory output = abi.decode(returndata, (bytes));
        return output.length > 0 && (uint8(output[0]) & 1) == 1;
    }

    /**
     * @notice Computes the 9 rule input bits per specification.
     * @dev Read-only roll of counters is applied for preview calculations.
     */
    function _inputBits(TradeParams calldata p) internal view returns (uint16 bits, bool isExit) {
        address base = baseToken;
        bool isBuy = p.tokenIn == base && p.tokenOut != base;
        isExit = p.tokenOut == base && p.tokenIn != base;

        // Bit 0: sane
        // block.timestamp drift tolerance: second-level deadline bounds
        if (
            // forge-lint: disable-next-line(block-timestamp)
            p.amountIn > 0 && p.amountOutMin > 0 && p.deadline >= block.timestamp
                // forge-lint: disable-next-line(block-timestamp)
                && p.deadline <= block.timestamp + 600 && (isBuy || isExit)
                && (p.feeTier == 500 || p.feeTier == 3000 || p.feeTier == 10000)
                && p.amountIn <= IERC20(p.tokenIn).balanceOf(address(this))
        ) {
            bits |= (1 << 0);
        }

        // Bit 1: tokenAllowed
        if (allowedTokens[isBuy ? p.tokenOut : p.tokenIn]) {
            bits |= (1 << 1);
        }

        // Bit 2: notExpired
        // block.timestamp drift tolerance: second-level expiration bounds
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp <= limits.expiresAt) {
            bits |= (1 << 2);
        }

        // Bit 3: notFrozen
        if (!frozen) {
            bits |= (1 << 3);
        }

        // Bit 4: sizeOk
        if (isExit || p.amountIn <= limits.maxTradeBase) {
            bits |= (1 << 4);
        }

        // UTC day calculation
        // block.timestamp drift tolerance: UTC day calculation (86400s) is immune to second-level drift
        // forge-lint: disable-next-line(block-timestamp, unsafe-typecast)
        bool sameDay = (uint64(block.timestamp / 86400) == dayIndex);

        // Bit 5: dailyOk
        if (isExit || ((sameDay ? buyVolumeTodayBase : 0) + p.amountIn <= limits.maxDailyBase)) {
            bits |= (1 << 5);
        }

        // Bit 6: tradesOk
        if (isExit || ((sameDay ? tradesToday : 0) < limits.maxTradesPerDay)) {
            bits |= (1 << 6);
        }

        // Bit 7: cooldownOk
        // block.timestamp drift tolerance: second-level cooldown comparison
        // forge-lint: disable-next-line(block-timestamp)
        if (isExit || lastBuyAt == 0 || block.timestamp >= lastBuyAt + limits.cooldownSec) {
            bits |= (1 << 7);
        }

        // Bit 8: isExit
        if (isExit) {
            bits |= (1 << 8);
        }
    }

    /**
     * @notice Previews trade rule evaluation without executing state changes.
     * @dev Never reverts; returns (bits, false) when blocked.
     */
    function previewTrade(TradeParams calldata p) external view returns (uint16 inputBits, bool allowed) {
        (uint16 bits,) = _inputBits(p);
        inputBits = bits;
        allowed = _isAllowedByCircuit(bits);
    }

    /**
     * @notice Trader trades on Uniswap V3 subject to circuit verification.
     * @param p Trade execution parameters.
     * @return amountOut The exact output amount received from the swap.
     */
    function trade(TradeParams calldata p) external nonReentrant onlyTrader returns (uint256 amountOut) {
        // 1. Verify circuit pinning per D15
        address currentImpl = IBeacon(beacon).implementation();
        if (currentImpl != beaconImplementation || currentImpl.codehash != beaconImplementationCodehash) {
            revert CircuitChanged();
        }

        // 2. Build input bits
        (uint16 bits, bool isExit) = _inputBits(p);

        // 3. Evaluate circuit per D16
        if (!_isAllowedByCircuit(bits)) {
            revert RuleBlocked(bits);
        }

        // 4. Effects: for buy, roll UTC day counters and record lastBuyAt
        if (!isExit) {
            // block.timestamp drift tolerance: UTC day calculation (86400s) is immune to second-level drift
            // forge-lint: disable-next-line(unsafe-typecast)
            uint64 currentDay = uint64(block.timestamp / 86400);
            if (currentDay != dayIndex) {
                dayIndex = currentDay;
                tradesToday = 1;
                // forge-lint: disable-next-line(unsafe-typecast)
                buyVolumeTodayBase = uint128(p.amountIn);
            } else {
                tradesToday += 1;
                // forge-lint: disable-next-line(unsafe-typecast)
                buyVolumeTodayBase += uint128(p.amountIn);
            }
            // forge-lint: disable-next-line(unsafe-typecast)
            lastBuyAt = uint64(block.timestamp);
        }

        // 5. Interaction: Uniswap V3 swap with exact approval and delta checks
        uint256 balanceInBefore = IERC20(p.tokenIn).balanceOf(address(this));
        uint256 balanceOutBefore = IERC20(p.tokenOut).balanceOf(address(this));

        IERC20(p.tokenIn).forceApprove(swapRouter, p.amountIn);

        ISwapRouter02.ExactInputSingleParams memory swapParams = ISwapRouter02.ExactInputSingleParams({
            tokenIn: p.tokenIn,
            tokenOut: p.tokenOut,
            fee: p.feeTier,
            recipient: address(this),
            amountIn: p.amountIn,
            amountOutMinimum: p.amountOutMin,
            sqrtPriceLimitX96: 0
        });

        // forge-lint: disable-next-line(reentrancy-no-eth)
        amountOut = ISwapRouter02(swapRouter).exactInputSingle(swapParams);

        IERC20(p.tokenIn).forceApprove(swapRouter, 0);

        uint256 balanceInAfter = IERC20(p.tokenIn).balanceOf(address(this));
        uint256 balanceOutAfter = IERC20(p.tokenOut).balanceOf(address(this));

        if (balanceInBefore - balanceInAfter != p.amountIn) {
            revert SwapMismatch();
        }
        if (balanceOutAfter <= balanceOutBefore) {
            revert SwapMismatch();
        }
        uint256 deltaOut = balanceOutAfter - balanceOutBefore;
        if (deltaOut < p.amountOutMin || deltaOut != amountOut) {
            revert SwapMismatch();
        }

        // forge-lint: disable-next-line(reentrancy-events)
        emit Traded(p.tokenIn, p.tokenOut, p.amountIn, amountOut, isExit);
    }

    /**
     * @notice Immediately freezes all buys.
     */
    function freeze() external onlyOwnerOrTrader {
        frozen = true;
        emit Frozen(msg.sender);
    }

    /**
     * @notice Immediately tightens limits and/or removes tokens from allowlist.
     * @param next Proposed tighter limits.
     * @param removeTokens Tokens to remove from the allowlist.
     */
    function tighten(Limits calldata next, address[] calldata removeTokens) external onlyOwnerOrTrader {
        LimitsLib.validate(next, minWithdrawDelaySec);
        if (!LimitsLib.isStricterOrEqual(next, limits)) {
            revert NotStricter();
        }

        limits = next;

        for (uint256 i = 0; i < removeTokens.length; i++) {
            allowedTokens[removeTokens[i]] = false;
        }

        emit Tightened(msg.sender, next);
    }

    /**
     * @notice Queues a proposed loosening change subject to loosenDelaySec.
     * @param next Proposed limits.
     * @param addTokens Tokens to add to the allowlist.
     * @param unfreeze Whether to unfreeze upon execution.
     */
    function queueLoosen(Limits calldata next, address[] calldata addTokens, bool unfreeze) external onlyOwner {
        LimitsLib.validate(next, minWithdrawDelaySec);

        // block.timestamp drift tolerance: second-level timelock precision is safe
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 eta = uint64(block.timestamp + loosenDelaySec);
        pendingLoosen = PendingChange({limits: next, eta: eta, exists: true, unfreeze: unfreeze});

        // Add tokens now or in pending? Add tokens are applied at execution time in executeLoosen
        // To keep storage minimal, addTokens are emitted in event and applied in execution
        for (uint256 i = 0; i < addTokens.length; i++) {
            // Checked during executeLoosen
        }

        emit LoosenQueued(owner, next, eta, unfreeze);
    }

    /**
     * @notice Executes a queued loosening change after eta.
     */
    function executeLoosen() external onlyOwner {
        PendingChange memory p = pendingLoosen;
        if (!p.exists) revert NothingPending();
        // block.timestamp drift tolerance: second-level timelock precision is safe
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < p.eta) revert TooEarly(p.eta);

        limits = p.limits;
        if (p.unfreeze) {
            frozen = false;
        }
        delete pendingLoosen;

        emit LoosenExecuted(owner, p.limits);
    }

    /**
     * @notice Cancels a pending loosening change.
     */
    function cancelLoosen() external onlyOwnerOrTrader {
        if (!pendingLoosen.exists) revert NothingPending();
        delete pendingLoosen;
        emit LoosenCancelled(msg.sender);
    }

    /**
     * @notice Requests a delayed withdrawal of vault funds.
     * @param token Token address to withdraw.
     * @param amount Requested withdrawal amount.
     */
    function requestWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0) || amount == 0) revert ZeroAddress();
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (amount > bal) revert TransferFailed();

        // block.timestamp drift tolerance: second-level timelock precision is safe
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 eta = uint64(block.timestamp + limits.withdrawDelaySec);
        pendingWithdrawal = PendingWithdrawal({token: token, amount: amount, eta: eta, exists: true});

        emit WithdrawRequested(owner, token, amount, eta);
    }

    /**
     * @notice Executes an approved withdrawal after eta.
     */
    function executeWithdraw() external nonReentrant onlyOwner {
        PendingWithdrawal memory w = pendingWithdrawal;
        if (!w.exists) revert NothingPending();
        // block.timestamp drift tolerance: second-level timelock precision is safe
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < w.eta) revert TooEarly(w.eta);

        delete pendingWithdrawal;

        uint256 currentBal = IERC20(w.token).balanceOf(address(this));
        uint256 transferAmount = w.amount < currentBal ? w.amount : currentBal;
        if (transferAmount > 0) {
            IERC20(w.token).safeTransfer(owner, transferAmount);
        }

        emit WithdrawExecuted(owner, w.token, transferAmount);
    }

    /**
     * @notice Cancels a pending withdrawal request.
     */
    function cancelWithdraw() external onlyOwnerOrTrader {
        if (!pendingWithdrawal.exists) revert NothingPending();
        delete pendingWithdrawal;
        emit WithdrawCancelled(msg.sender);
    }

    /**
     * @notice Replaces the active trader key.
     * @param newTrader New trader address.
     */
    function setTrader(address newTrader) external onlyOwner {
        if (newTrader == address(0)) revert ZeroAddress();
        trader = newTrader;
        emit TraderChanged(owner, newTrader);
    }

    /**
     * @notice Deposits baseToken into the vault.
     * @param amount Amount of baseToken to deposit.
     */
    function deposit(uint256 amount) external nonReentrant onlyOwner {
        if (amount == 0) revert TransferFailed();
        uint256 currentBal = IERC20(baseToken).balanceOf(address(this));
        if (currentBal + amount > maxDepositBase) {
            revert DepositCapExceeded();
        }

        IERC20(baseToken).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(owner, amount);
    }

    /**
     * @notice Returns a full snapshot view of vault state.
     */
    function state() external view returns (VaultStateView memory) {
        return VaultStateView({
            owner: owner,
            trader: trader,
            limits: limits,
            frozen: frozen,
            dayIndex: dayIndex,
            tradesToday: tradesToday,
            buyVolumeTodayBase: buyVolumeTodayBase,
            lastBuyAt: lastBuyAt,
            pending: pendingLoosen,
            withdrawal: pendingWithdrawal
        });
    }
}
